import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { type Agent, AgentManager } from "@tokenring-ai/agent";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import { ConfigurationError, type TokenRingService } from "@tokenring-ai/app/types";
import formatError from "@tokenring-ai/utility/error/formatError";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import {
  orderFrontmatter,
  type ParsedTaskInput,
  type ParsedTaskServiceConfig,
  type Task,
  type TaskBatch,
  type TaskFrontmatter,
  TaskFrontmatterSchema,
  type TaskLineMatch,
  type TaskListSummary,
  type TaskRef,
  type TaskRun,
  type TaskRunStatus,
  type TaskSearchMatch,
  TaskServiceConfigSchema,
  type TaskStatus,
  type TaskStatusCounts,
  type TaskSummary,
} from "./schema.ts";
import { TaskState } from "./state/taskState.ts";
import { parseFrontmatter, writeMarkdownAtomic } from "./util/frontmatter.ts";
import { formatTaskPath } from "./util/taskPath.ts";
import { mapRunStatusToTaskStatus } from "./util/taskStatus.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".md";

const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SNIPPETS_PER_TASK = 5;

function assertValidName(name: string, kind: "list" | "task"): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid ${kind} name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`,
    );
  }
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

function emptyStatusCounts(): TaskStatusCounts {
  return { pending: 0, "in-progress": 0, blocked: 0, done: 0, cancelled: 0 };
}

/** Raised when an editor's optimistic-concurrency check fails. */
export class TaskConflictError extends Error {
  constructor(
    message: string,
    readonly currentUpdatedAt: string,
  ) {
    super(message);
    this.name = "TaskConflictError";
  }
}

export interface TaskFilter {
  status?: TaskStatus | undefined;
  tag?: string | undefined;
  agentType?: string | undefined;
}

export interface TaskSearchOptions {
  list?: string | undefined;
  status?: TaskStatus | undefined;
  limit?: number | undefined;
  maxSnippetsPerTask?: number | undefined;
}

export interface RunOptions {
  headless?: boolean | undefined;
  batchId?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Receives status updates from the task's agent when the sub-agent config allows it. */
  parentAgent?: Agent | undefined;
  /** Defaults to `headless`: an interactive run leaves its agent around to talk to. */
  cleanupAgent?: boolean | undefined;
}

export interface GroupRunOptions extends RunOptions {
  parallel?: number | undefined;
  label?: string | undefined;
}

export interface TaskRunOutcome {
  runId: string;
  list: string;
  name: string;
  status: TaskRunStatus;
  message: string;
}

export interface TaskBatchOutcome {
  batchId: string;
  outcomes: TaskRunOutcome[];
}

/**
 * Manages tasks as markdown files with YAML frontmatter, and runs them on spawned agents.
 *
 * Layout: `<taskDirectory>/<list>/<name>.md`
 *
 * Running a task spawns an agent of the task's agent type and sends it either the markdown body
 * or, when the frontmatter carries `steps`, one step at a time. Progress is recorded in
 * {@link TaskState} so the dashboard can follow along, and the outcome is written back into the
 * file's frontmatter.
 */
export default class TaskService implements TokenRingService {
  readonly name = "TaskService";
  description = "Tasks, backed by markdown files on disk";

  private config = TaskServiceConfigSchema.parse({});

  /**
   * Serializes writes per file path. This is the only race that is actually fixable from inside
   * one process: an external editor can still win the last write.
   */
  private readonly fileLocks = new Map<string, Promise<unknown>>();

  /** Lets a run be cancelled before its agent has even been spawned. */
  private readonly runControllers = new Map<string, AbortController>();

  /** Runs that moved their task to `in-progress`, and so are allowed to move it out again. */
  private readonly runOwnsInProgress = new Set<string>();

  constructor(private app: TokenRingApp) {
    this.app.initializeState(TaskState, this.config.maxFinishedRuns);
  }

  reconfigure(config: ParsedTaskServiceConfig): void {
    this.config = config;
  }

  /** Repairs task files left mid-run by a crash. Safe to call more than once. */
  async start(): Promise<void> {
    await this.reconcileStaleTasks();
  }

  getTaskDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.config.taskDirectory);
  }

  getTaskDirectoryName(): string {
    return this.config.taskDirectory;
  }

  getDefaultList(): string {
    return this.config.defaultList;
  }

  getDefaultAgentType(): string {
    return this.config.defaultAgentType;
  }

  getParallel(): number {
    return this.config.parallel;
  }

  getAgentTypes(): string[] {
    return [...this.config.agentTypes];
  }

  // ─── Paths and locking ───────────────────────────────────────────────────────

  private resolveListDirectory(list: string): string {
    assertValidName(list, "list");
    return path.join(this.getTaskDirectory(), list);
  }

  private resolveTaskPath(list: string, name: string): string {
    assertValidName(name, "task");
    return path.join(this.resolveListDirectory(list), `${name}${EXTENSION}`);
  }

  /** Runs `fn` with exclusive access to `filePath` relative to other callers in this process. */
  private async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.fileLocks.get(filePath) ?? Promise.resolve();
    // Chained onto both outcomes so one failed write cannot wedge the queue behind it.
    const current = previous.then(fn, fn);
    const guard = current.catch(() => {});
    this.fileLocks.set(filePath, guard);
    try {
      return await current;
    } finally {
      // Only clear when nothing else queued behind us, so a later waiter isn't stranded.
      if (this.fileLocks.get(filePath) === guard) this.fileLocks.delete(filePath);
    }
  }

  // ─── Lists ───────────────────────────────────────────────────────────────────

  /** Every task list, sorted by name. A missing task directory is empty, not an error. */
  async listTaskLists(): Promise<TaskListSummary[]> {
    const root = this.getTaskDirectory();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const lists: TaskListSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (!NAME_PATTERN.test(entry.name)) continue;
      const listDir = path.join(root, entry.name);
      const stat = await fs.stat(listDir);
      const tasks = await this.listTasks(entry.name);
      const statusCounts = emptyStatusCounts();
      for (const task of tasks) statusCounts[task.status] += 1;
      lists.push({ name: entry.name, taskCount: tasks.length, statusCounts, updatedAt: stat.mtime.toISOString() });
    }

    return lists.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTaskList(list: string): Promise<TaskListSummary> {
    const listDir = this.resolveListDirectory(list);
    if (await pathExists(listDir)) {
      throw new Error(`Task list "${list}" already exists`);
    }
    await fs.mkdir(listDir, { recursive: true });
    const stat = await fs.stat(listDir);
    return { name: list, taskCount: 0, statusCounts: emptyStatusCounts(), updatedAt: stat.mtime.toISOString() };
  }

  async deleteTaskList(list: string): Promise<boolean> {
    const listDir = this.resolveListDirectory(list);
    try {
      await fs.rm(listDir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────────

  /**
   * Tasks in one list, sorted by name. A file that fails to parse is skipped with a logged
   * error so that one bad task cannot hide the rest of the list.
   */
  async listTasks(list: string, filter: TaskFilter = {}): Promise<TaskSummary[]> {
    const listDir = this.resolveListDirectory(list);
    let entries: string[];
    try {
      entries = await fs.readdir(listDir);
    } catch {
      return [];
    }

    const tasks: TaskSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;
      const taskName = entry.slice(0, -EXTENSION.length);
      if (!NAME_PATTERN.test(taskName)) continue;
      try {
        const task = await this.readTaskFile(path.join(listDir, entry), list, taskName);
        if (task && this.matchesFilter(task, filter)) tasks.push(this.toSummary(task));
      } catch (error) {
        console.error(`Skipping invalid task file ${list}/${entry}: ${formatError(error)}`);
      }
    }

    return tasks.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every task across every list, sorted by list then name. */
  async listAllTasks(filter: TaskFilter = {}): Promise<TaskSummary[]> {
    const tasks: TaskSummary[] = [];
    for (const list of await this.listTaskLists()) {
      tasks.push(...(await this.listTasks(list.name, filter)));
    }
    return tasks;
  }

  private matchesFilter(task: Task, filter: TaskFilter): boolean {
    if (filter.status && task.status !== filter.status) return false;
    if (filter.agentType && task.agentType !== filter.agentType) return false;
    if (filter.tag && !task.tags.includes(filter.tag)) return false;
    return true;
  }

  private toSummary(task: Task): TaskSummary {
    const { body: _body, steps: _steps, lastResult: _lastResult, frontmatter: _frontmatter, ...summary } = task;
    return summary;
  }

  async getTask(list: string, name: string): Promise<Task | null> {
    return this.readTaskFile(this.resolveTaskPath(list, name), list, name);
  }

  async createTask(list: string, name: string, input: ParsedTaskInput): Promise<Task> {
    const filePath = this.resolveTaskPath(list, name);
    return this.withFileLock(filePath, async () => {
      if (await pathExists(filePath)) {
        throw new Error(`Task "${name}" already exists in list "${list}"`);
      }
      const frontmatter = this.applyInput(TaskFrontmatterSchema.parse({}), input, { createdAt: new Date().toISOString() });
      return this.writeTaskFile(list, name, frontmatter, input.body);
    });
  }

  /**
   * Creates or overwrites a task.
   *
   * `expectedUpdatedAt` is for interactive editors that want to detect a concurrent change;
   * tools and commands omit it, since last-write-wins is the right default for an agent.
   *
   * The check compares mtime, so two writes landing inside the same millisecond are
   * indistinguishable. That is fine for its intended use — a human editing in the dashboard —
   * but it is not a general-purpose lock.
   */
  async updateTask(list: string, name: string, input: ParsedTaskInput, options: { expectedUpdatedAt?: string | undefined } = {}): Promise<Task> {
    const filePath = this.resolveTaskPath(list, name);
    return this.withFileLock(filePath, async () => {
      const existing = await this.readTaskFile(filePath, list, name);

      if (options.expectedUpdatedAt !== undefined && existing && existing.updatedAt !== options.expectedUpdatedAt) {
        throw new TaskConflictError(`Task "${list}/${name}" changed on disk since it was loaded`, existing.updatedAt);
      }

      const base = existing?.frontmatter ?? TaskFrontmatterSchema.parse({});
      const frontmatter = this.applyInput(base, input, { createdAt: base.createdAt || new Date().toISOString() });
      return this.writeTaskFile(list, name, frontmatter, input.body);
    });
  }

  async setTaskStatus(list: string, name: string, status: TaskStatus): Promise<Task> {
    const filePath = this.resolveTaskPath(list, name);
    return this.withFileLock(filePath, async () => {
      const existing = await this.readTaskFile(filePath, list, name);
      if (!existing) throw new Error(`Task "${list}/${name}" not found`);
      return this.writeTaskFile(list, name, { ...existing.frontmatter, status }, existing.body);
    });
  }

  async moveTask(fromList: string, fromName: string, toList: string, toName: string): Promise<Task> {
    const fromPath = this.resolveTaskPath(fromList, fromName);
    const toPath = this.resolveTaskPath(toList, toName);
    if (fromPath === toPath) {
      const task = await this.getTask(fromList, fromName);
      if (!task) throw new Error(`Task "${fromList}/${fromName}" not found`);
      return task;
    }

    // Locked in sorted order so two concurrent moves can never deadlock against each other.
    const [first, second] = fromPath < toPath ? [fromPath, toPath] : [toPath, fromPath];
    return this.withFileLock(first, () =>
      this.withFileLock(second, async () => {
        const existing = await this.readTaskFile(fromPath, fromList, fromName);
        if (!existing) throw new Error(`Task "${fromList}/${fromName}" not found`);
        if (await pathExists(toPath)) throw new Error(`Task "${toList}/${toName}" already exists`);

        const moved = await this.writeTaskFile(toList, toName, existing.frontmatter, existing.body);
        await fs.unlink(fromPath).catch(() => {});
        return moved;
      }),
    );
  }

  async deleteTask(list: string, name: string): Promise<boolean> {
    const filePath = this.resolveTaskPath(list, name);
    return this.withFileLock(filePath, async () => {
      try {
        await fs.unlink(filePath);
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Case-insensitive substring search across task names, titles, descriptions, tags and bodies.
   *
   * Terms are OR'd together. Every task is read on each search — the store is a small set of
   * markdown files, so no index is warranted. Scoring matches MemoryService so the two
   * file-backed plugins rank results the same way.
   */
  async searchTasks(terms: string | string[], options: TaskSearchOptions = {}): Promise<TaskSearchMatch[]> {
    const needles = (Array.isArray(terms) ? terms : [terms]).map(term => term.trim().toLowerCase()).filter(term => term.length > 0);
    if (needles.length === 0) return [];

    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    const maxSnippets = options.maxSnippetsPerTask ?? DEFAULT_SNIPPETS_PER_TASK;
    const lists = options.list ? [options.list] : (await this.listTaskLists()).map(list => list.name);

    const matches: TaskSearchMatch[] = [];
    for (const list of lists) {
      for (const summary of await this.listTasks(list, { status: options.status })) {
        const task = await this.getTask(list, summary.name);
        if (!task) continue;

        const haystack = `${task.name} ${task.title} ${task.description} ${task.tags.join(" ")}`.toLowerCase();
        const nameHits = needles.filter(needle => haystack.includes(needle)).length;

        const lineMatches: TaskLineMatch[] = [];
        const lines = task.body.split("\n");
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index] ?? "";
          if (needles.some(needle => line.toLowerCase().includes(needle))) {
            lineMatches.push({ line: index + 1, content: line });
          }
        }

        if (nameHits === 0 && lineMatches.length === 0) continue;

        // Name hits outrank content hits; content score saturates so one sprawling task cannot
        // crowd out several tightly-matching ones.
        const score = nameHits * 5 + Math.min(lineMatches.length * 0.3, 3);
        const matchType = nameHits > 0 && lineMatches.length > 0 ? "both" : nameHits > 0 ? "name" : "content";

        matches.push({ ...this.toSummary(task), score, matchType, lineMatches: lineMatches.slice(0, maxSnippets) });
      }
    }

    return matches.sort((a, b) => b.score - a.score || a.list.localeCompare(b.list) || a.name.localeCompare(b.name)).slice(0, limit);
  }

  // ─── File IO ─────────────────────────────────────────────────────────────────

  private applyInput(base: TaskFrontmatter, input: ParsedTaskInput, defaults: { createdAt: string }): TaskFrontmatter {
    const next: TaskFrontmatter = { ...base, createdAt: base.createdAt || defaults.createdAt };
    if (input.title !== undefined) next.title = input.title;
    if (input.description !== undefined) next.description = input.description;
    if (input.agentType !== undefined) next.agentType = input.agentType;
    if (input.status !== undefined) next.status = input.status;
    if (input.priority !== undefined) next.priority = input.priority;
    if (input.tags !== undefined) next.tags = [...input.tags];
    if (input.steps !== undefined) next.steps = [...input.steps];
    if (input.dependsOn !== undefined) next.dependsOn = [...input.dependsOn];
    return next;
  }

  private async readTaskFile(filePath: string, list: string, name: string): Promise<Task | null> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;

    const content = await fs.readFile(filePath, "utf-8");
    const { data, body } = parseFrontmatter(content, TaskFrontmatterSchema);
    // Presented in the same canonical form the writer produces, so that reading a task and
    // writing it straight back is a no-op rather than accreting trailing newlines.
    const canonicalBody = body.trimEnd();

    return {
      list,
      name,
      title: data.title,
      description: data.description,
      agentType: data.agentType,
      status: data.status,
      priority: data.priority,
      tags: data.tags,
      stepCount: data.steps.length,
      dependsOn: data.dependsOn,
      lastRunAt: data.lastRunAt,
      lastRunStatus: data.lastRunStatus,
      lastRunId: data.lastRunId,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      body: canonicalBody,
      steps: data.steps,
      lastResult: data.lastResult,
      frontmatter: data,
    };
  }

  private async writeTaskFile(list: string, name: string, frontmatter: TaskFrontmatter, body: string): Promise<Task> {
    const filePath = this.resolveTaskPath(list, name);
    await writeMarkdownAtomic(filePath, orderFrontmatter(frontmatter), body);
    const task = await this.readTaskFile(filePath, list, name);
    if (!task) throw new Error(`Task "${list}/${name}" could not be read back after writing`);
    return task;
  }

  /**
   * Merges run bookkeeping into a task's frontmatter without touching its body.
   *
   * The file is re-read inside the lock so that a body edit landing between run start and run
   * finish survives — which is why this is separate from {@link updateTask}.
   */
  private async patchFrontmatter(list: string, name: string, patch: Partial<TaskFrontmatter>): Promise<void> {
    if (!this.config.writeBackStatus) return;
    const filePath = this.resolveTaskPath(list, name);
    await this.withFileLock(filePath, async () => {
      const existing = await this.readTaskFile(filePath, list, name);
      if (!existing) return;
      await this.writeTaskFile(list, name, { ...existing.frontmatter, ...patch }, existing.body);
    }).catch(error => {
      this.app.serviceError(this, `Could not update task "${list}/${name}":`, error);
    });
  }

  /**
   * Returns tasks stranded at `in-progress` by a crash to `pending`.
   *
   * Without this, a group run interrupted by a restart leaves every task it had claimed looking
   * busy forever, because the runs that owned them were rewritten to `cancelled` on load.
   */
  private async reconcileStaleTasks(): Promise<void> {
    if (!this.config.writeBackStatus) return;
    const activeRunIds = new Set(
      this.getRuns()
        .filter(run => run.finishedAt === null)
        .map(run => run.id),
    );

    for (const summary of await this.listAllTasks({ status: "in-progress" })) {
      const task = await this.getTask(summary.list, summary.name);
      if (!task) continue;
      if (task.frontmatter.lastRunId && activeRunIds.has(task.frontmatter.lastRunId)) continue;
      await this.patchFrontmatter(summary.list, summary.name, { status: "pending", lastRunStatus: "cancelled" });
    }
  }

  // ─── Runs ────────────────────────────────────────────────────────────────────

  getRuns(): TaskRun[] {
    return this.app.getState(TaskState).runs;
  }

  getRun(runId: string): TaskRun | null {
    return this.app.getState(TaskState).getRun(runId);
  }

  getRunsForTask(list: string, name: string): TaskRun[] {
    return this.app.getState(TaskState).getRunsForTask(list, name);
  }

  getBatches(): TaskBatch[] {
    return this.app.getState(TaskState).batches;
  }

  getBatch(batchId: string): TaskBatch | null {
    return this.app.getState(TaskState).getBatch(batchId);
  }

  /** Runs one task and resolves once it finishes. */
  async runTask(ref: TaskRef, options: RunOptions = {}): Promise<TaskRunOutcome> {
    const runId = await this.registerRun(ref, options.batchId ?? null);
    return this.executeRun(runId, options);
  }

  /**
   * Starts one task in the background and returns as soon as its agent exists.
   *
   * Progress is followed through {@link TaskState}, not through this promise.
   */
  async spawnTask(ref: TaskRef, options: RunOptions = {}): Promise<{ runId: string; agentId: string | null }> {
    const runId = await this.registerRun(ref, options.batchId ?? null);
    this.app.runBackgroundTask(this, async signal => {
      await this.executeRun(runId, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal });
    });
    return { runId, agentId: await this.waitForAgentId(runId) };
  }

  /**
   * Waits just long enough for a backgrounded run to register its agent, so callers can offer to
   * open it. Resolves null if the run finishes (or fails to spawn) before that happens.
   */
  private async waitForAgentId(runId: string, timeoutMs = 10_000): Promise<string | null> {
    const settled = (run: TaskRun | null): boolean => run === null || run.agentId !== null || run.finishedAt !== null;

    const immediate = this.getRun(runId);
    if (settled(immediate)) return immediate?.agentId ?? null;

    try {
      for await (const state of this.app.subscribeStateAsync(TaskState, AbortSignal.timeout(timeoutMs))) {
        const run = state.getRun(runId);
        if (settled(run)) return run?.agentId ?? null;
      }
    } catch {
      // Timed out; the run is still tracked in state, it just has no agent yet.
    }
    return this.getRun(runId)?.agentId ?? null;
  }

  /**
   * Runs a group of tasks, at most `parallel` at a time, and resolves once all of them finish.
   *
   * Each task gets its own agent and its own tracked run; they share a batch id so the dashboard
   * can show group progress.
   */
  async runTasks(refs: TaskRef[], options: GroupRunOptions = {}): Promise<TaskBatchOutcome> {
    const parallel = Math.max(1, options.parallel ?? this.config.parallel);
    const batchId = randomUUID();
    const list = refs[0]?.list ?? "";

    this.app.mutateState(TaskState, state => state.addBatch({ id: batchId, label: options.label ?? `${refs.length} tasks`, list, parallel }));

    const outcomes = new Map<string, TaskRunOutcome>();
    const queue = [...refs];
    const signal = options.signal;

    // Hand-rolled rather than a mapLimit helper so that refs which never start are still recorded
    // as cancelled runs, instead of vanishing from the run history.
    const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      while (queue.length > 0) {
        const ref = queue.shift()!;
        const key = formatTaskPath(ref);
        if (signal?.aborted) {
          outcomes.set(key, await this.recordSkippedRun(ref, batchId, "Batch was cancelled before this task started."));
          continue;
        }
        outcomes.set(key, await this.runTask(ref, { ...options, batchId }));
      }
    });

    try {
      await Promise.all(workers);
    } finally {
      this.app.mutateState(TaskState, state => state.finishBatch(batchId));
    }

    return { batchId, outcomes: refs.map(ref => outcomes.get(formatTaskPath(ref))).filter((outcome): outcome is TaskRunOutcome => outcome !== undefined) };
  }

  /** Starts a group in the background and returns its batch id immediately. */
  spawnTasks(refs: TaskRef[], options: GroupRunOptions = {}): string {
    const batchId = randomUUID();
    this.app.runBackgroundTask(this, async signal => {
      await this.runTasks(refs, { ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal, batchId });
    });
    return batchId;
  }

  cancelRun(runId: string, reason = "Cancelled by request"): boolean {
    const run = this.getRun(runId);
    if (!run || run.finishedAt !== null) return false;

    this.runControllers.get(runId)?.abort(reason);
    if (run.agentId) this.app.requireService(AgentManager).deleteAgent(run.agentId, reason);
    return true;
  }

  cancelBatch(batchId: string, reason = "Batch cancelled by request"): number {
    const runs = this.app.getState(TaskState).getRunsByBatch(batchId);
    let cancelled = 0;
    for (const run of runs) {
      if (this.cancelRun(run.id, reason)) cancelled += 1;
    }
    return cancelled;
  }

  /** Registers a run in state, resolving the task and its agent type up front. */
  private async registerRun(ref: TaskRef, batchId: string | null): Promise<string> {
    const task = await this.getTask(ref.list, ref.name);
    if (!task) {
      throw new ConfigurationError(this.name, `Task "${formatTaskPath(ref)}" not found.`);
    }

    const agentType = task.agentType || this.config.defaultAgentType;
    const messages = task.steps.length > 0 ? task.steps : [task.body.trim()].filter(message => message !== "");

    const run = this.app.mutateState(TaskState, state =>
      state.addRun({
        id: randomUUID(),
        batchId,
        list: ref.list,
        name: ref.name,
        title: task.title || ref.name,
        agentType,
        messages,
      }),
    );

    return run.id;
  }

  /** Records a run that was cancelled before it ever started, so the batch history stays complete. */
  private async recordSkippedRun(ref: TaskRef, batchId: string, reason: string): Promise<TaskRunOutcome> {
    let runId: string;
    try {
      runId = await this.registerRun(ref, batchId);
    } catch {
      // The task no longer exists; nothing meaningful to record.
      return { runId: "", list: ref.list, name: ref.name, status: "cancelled", message: reason };
    }
    this.app.mutateState(TaskState, state => state.finishRun(runId, "cancelled", reason));
    return { runId, list: ref.list, name: ref.name, status: "cancelled", message: reason };
  }

  /**
   * Spawns the run's agent and feeds it the task, one message at a time, stopping at the first
   * message that does not succeed.
   */
  private async executeRun(runId: string, options: RunOptions): Promise<TaskRunOutcome> {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Task run "${runId}" not found`);

    const ref: TaskRef = { list: run.list, name: run.name };
    const finish = (status: TaskRunStatus, message: string): TaskRunOutcome => {
      this.app.mutateState(TaskState, state => state.finishRun(runId, status, message));
      return { runId, list: run.list, name: run.name, status, message };
    };

    if (run.messages.length === 0) {
      const outcome = finish("failed", "Task has no body and no steps, so there is nothing to run.");
      await this.writeRunResult(ref, runId, outcome);
      return outcome;
    }

    const agentManager = this.app.requireService(AgentManager);
    if (!agentManager.getAgentConfig(run.agentType)) {
      const outcome = finish("failed", `Task "${formatTaskPath(ref)}" uses agent type "${run.agentType}", which does not exist.`);
      await this.writeRunResult(ref, runId, outcome);
      return outcome;
    }

    const controller = new AbortController();
    this.runControllers.set(runId, controller);
    await this.claimTask(ref, runId);

    const headless = options.headless ?? true;
    const cleanupAgent = options.cleanupAgent ?? headless;
    let agent: Agent | undefined;

    try {
      agent = agentManager.spawnAgent({ agentType: run.agentType, headless });
      this.app.mutateState(TaskState, state => state.updateRun(runId, { agentId: agent!.id }));

      const signals = [controller.signal, agent.agentShutdownSignal];
      if (options.signal) signals.push(options.signal);
      const signal = AbortSignal.any(signals);

      // Agent types can carry initial commands, so wait for the agent to settle before sending.
      await agent.waitForState(AgentEventState, state => state.idle, signal);

      const from = `Task ${formatTaskPath(ref)}`;
      let lastMessage = "";

      for (const [index, message] of run.messages.entries()) {
        if (signal.aborted) {
          const outcome = finish("cancelled", "Task run was cancelled.");
          await this.writeRunResult(ref, runId, outcome);
          return outcome;
        }

        this.app.mutateState(TaskState, state => state.updateRun(runId, { currentStep: index, status: "running" }));
        const result = await this.runStep(agent, message, from, signal, options.parentAgent);
        lastMessage = result.message;
        this.app.mutateState(TaskState, state => state.updateRun(runId, { message: result.message }));

        if (result.status !== "success") {
          const outcome = finish(result.status === "cancelled" ? "cancelled" : "failed", result.message);
          await this.writeRunResult(ref, runId, outcome);
          return outcome;
        }
      }

      const outcome = finish("completed", lastMessage);
      await this.writeRunResult(ref, runId, outcome);
      return outcome;
    } catch (error) {
      this.app.serviceError(this, `Task "${formatTaskPath(ref)}" failed:`, error);
      const outcome = finish("failed", formatError(error));
      await this.writeRunResult(ref, runId, outcome);
      return outcome;
    } finally {
      this.runControllers.delete(runId);
      this.runOwnsInProgress.delete(runId);
      if (agent && cleanupAgent) agentManager.deleteAgent(agent.id, "Task run complete");
    }
  }

  /** Sends one message to the agent and resolves with the agent's response to it. */
  private async runStep(
    agent: Agent,
    message: string,
    from: string,
    signal: AbortSignal,
    parentAgent?: Agent,
  ): Promise<{ status: "success" | "error" | "cancelled"; message: string }> {
    const cursor = agent.getState(AgentEventState).getEventCursorFromCurrentPosition();
    const requestId = agent.handleInput({ from, message });

    for await (const state of agent.subscribeStateAsync(AgentEventState, signal)) {
      for (const event of state.yieldEventsByCursor(cursor)) {
        if (parentAgent && event.type === "agent.status" && event.currentActivity && this.config.subAgent.forwardStatusMessages) {
          parentAgent.chatOutput(`[${from}] ${event.currentActivity}`);
        }
        if (event.type === "agent.response" && event.requestId === requestId) {
          return { status: event.status, message: event.message };
        }
      }
    }

    return { status: "cancelled", message: "Agent stopped before the task completed." };
  }

  /** Moves the task to `in-progress` if it is free, remembering whether this run owns that move. */
  private async claimTask(ref: TaskRef, runId: string): Promise<void> {
    const task = await this.getTask(ref.list, ref.name);
    if (!task) return;

    const nextStatus = mapRunStatusToTaskStatus("starting", task.status, false);
    if (nextStatus) this.runOwnsInProgress.add(runId);

    await this.patchFrontmatter(ref.list, ref.name, {
      ...(nextStatus ? { status: nextStatus } : {}),
      lastRunAt: new Date().toISOString(),
      lastRunId: runId,
      lastRunStatus: "running",
    });
  }

  /** Writes a finished run's outcome back into the task's frontmatter. */
  private async writeRunResult(ref: TaskRef, runId: string, outcome: TaskRunOutcome): Promise<void> {
    const task = await this.getTask(ref.list, ref.name);
    if (!task) return;

    const nextStatus = mapRunStatusToTaskStatus(outcome.status, task.status, this.runOwnsInProgress.has(runId));

    await this.patchFrontmatter(ref.list, ref.name, {
      ...(nextStatus ? { status: nextStatus } : {}),
      lastRunAt: new Date().toISOString(),
      lastRunId: runId,
      lastRunStatus: outcome.status,
      lastResult: trimMiddle(outcome.message, Math.floor(this.config.maxResultLength / 2), Math.floor(this.config.maxResultLength / 2)),
    });
  }
}
