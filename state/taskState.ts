import { AppStateSlice } from "@tokenring-ai/app/types";
import { z } from "zod";
import { type TaskBatch, TaskBatchSchema, type TaskRun, TaskRunSchema, type TaskRunStatus } from "../schema.ts";

const serializationSchema = z.object({
  runs: z.array(TaskRunSchema),
  batches: z.array(TaskBatchSchema),
});

/** The fields a caller supplies when a run is registered; the rest is bookkeeping. */
export type NewTaskRun = Pick<TaskRun, "id" | "batchId" | "list" | "name" | "title" | "agentType" | "messages">;

/** The fields a caller supplies when a batch is registered. */
export type NewTaskBatch = Pick<TaskBatch, "id" | "label" | "list" | "parallel">;

const TERMINAL_STATUSES: ReadonlySet<TaskRunStatus> = new Set<TaskRunStatus>(["completed", "failed", "cancelled"]);

export function isRunFinished(status: TaskRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * App-level record of every task run: which agent is executing it, which step it is on, and how
 * it ended. Finished runs are kept (trimmed to `maxFinishedRuns`) so the dashboard can show
 * recent history.
 *
 * This is app state rather than agent state because runs outlive the agent that started them —
 * a run can be triggered over RPC with no agent involved at all.
 */
export class TaskState extends AppStateSlice<typeof serializationSchema> {
  runs: TaskRun[] = [];
  batches: TaskBatch[] = [];

  constructor(readonly maxFinishedRuns: number) {
    super("TaskState", serializationSchema);
  }

  serialize(): z.output<typeof serializationSchema> {
    return { runs: this.runs.map(run => ({ ...run })), batches: this.batches.map(batch => ({ ...batch })) };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    // Agents don't survive a restart, so anything still in flight is recorded as cancelled rather
    // than left looking like it is still making progress.
    const interruptedAt = Date.now();
    this.runs = data.runs.map(run =>
      isRunFinished(run.status) ? { ...run } : { ...run, status: "cancelled", message: "Interrupted by an application restart", finishedAt: interruptedAt },
    );
    this.batches = data.batches.map(batch => ({ ...batch, finishedAt: batch.finishedAt ?? interruptedAt }));
  }

  getRun(runId: string): TaskRun | null {
    return this.runs.find(run => run.id === runId) ?? null;
  }

  getRunByAgentId(agentId: string): TaskRun | null {
    return this.runs.find(run => run.agentId === agentId) ?? null;
  }

  getRunsByBatch(batchId: string): TaskRun[] {
    return this.runs.filter(run => run.batchId === batchId);
  }

  getRunsForTask(list: string, name: string): TaskRun[] {
    return this.runs.filter(run => run.list === list && run.name === name);
  }

  addRun(run: NewTaskRun): TaskRun {
    const created: TaskRun = {
      ...run,
      messages: [...run.messages],
      agentId: null,
      currentStep: 0,
      status: "starting",
      message: "",
      startedAt: Date.now(),
      finishedAt: null,
    };
    this.runs.push(created);
    const batch = run.batchId ? this.getBatch(run.batchId) : null;
    if (batch && !batch.runIds.includes(created.id)) batch.runIds.push(created.id);
    this.trimFinishedRuns();
    return created;
  }

  updateRun(runId: string, changes: Partial<Omit<TaskRun, "id">>): void {
    const run = this.getRun(runId);
    if (!run) return;
    Object.assign(run, changes);
  }

  finishRun(runId: string, status: TaskRunStatus, message: string): void {
    const run = this.getRun(runId);
    if (!run) return;
    run.status = status;
    run.message = message;
    run.finishedAt = Date.now();
    if (status === "completed") run.currentStep = run.messages.length;
    this.trimFinishedRuns();
  }

  getBatch(batchId: string): TaskBatch | null {
    return this.batches.find(batch => batch.id === batchId) ?? null;
  }

  addBatch(batch: NewTaskBatch): TaskBatch {
    const created: TaskBatch = { ...batch, runIds: [], startedAt: Date.now(), finishedAt: null };
    this.batches.push(created);
    return created;
  }

  finishBatch(batchId: string): void {
    const batch = this.getBatch(batchId);
    if (!batch || batch.finishedAt !== null) return;
    batch.finishedAt = Date.now();
  }

  /** Drops the oldest finished runs, plus any batch left with no runs. In-flight runs are never trimmed. */
  private trimFinishedRuns(): void {
    const finished = this.runs.filter(run => isRunFinished(run.status));
    const excess = finished.length - this.maxFinishedRuns;
    if (excess <= 0) return;

    const dropped = new Set(finished.slice(0, excess).map(run => run.id));
    this.runs = this.runs.filter(run => !dropped.has(run.id));

    const liveBatchIds = new Set(this.runs.map(run => run.batchId).filter((id): id is string => id !== null));
    this.batches = this.batches.filter(batch => liveBatchIds.has(batch.id));
    for (const batch of this.batches) {
      batch.runIds = batch.runIds.filter(id => !dropped.has(id));
    }
  }
}
