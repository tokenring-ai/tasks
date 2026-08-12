import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

/** Where a task sits on the board. Durable — this lives in the file's frontmatter. */
export const TaskStatusSchema = z.enum(["pending", "in-progress", "blocked", "done", "cancelled"]);
export type TaskStatus = z.output<typeof TaskStatusSchema>;

/** How one execution of a task went. Ephemeral — this lives in app state, not on disk. */
export const TaskRunStatusSchema = z.enum(["starting", "running", "completed", "failed", "cancelled"]);
export type TaskRunStatus = z.output<typeof TaskRunStatusSchema>;

export const TaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TaskPriority = z.output<typeof TaskPrioritySchema>;

export const TASK_STATUSES = TaskStatusSchema.options;

/**
 * The frontmatter block of a task file.
 *
 * Deliberately a `looseObject`: unknown keys are preserved so that writing a run's status back
 * into a task never silently deletes a field the user added by hand.
 *
 * Every field has a default so that a markdown file with no frontmatter at all still parses
 * into a valid task — that is the point of the file format.
 */
export const TaskFrontmatterSchema = z.looseObject({
  title: z.string().default(""),
  description: z.string().default(""),
  /** Empty falls back to the configured `defaultAgentType` at run time. */
  agentType: z.string().default(""),
  status: TaskStatusSchema.default("pending"),
  priority: TaskPrioritySchema.default("normal"),
  tags: z.array(z.string()).default([]),
  /** When non-empty these replace the body as the message sequence sent to the agent. */
  steps: z.array(z.string()).default([]),
  /** Names of other tasks in the same list. Parsed today, honoured by the scheduler later. */
  dependsOn: z.array(z.string()).default([]),
  /** Persisted rather than derived: `stat.birthtime` is unreliable and lost on checkout/copy. */
  createdAt: z.string().default(""),
  lastRunAt: z.string().nullable().default(null),
  lastRunStatus: TaskRunStatusSchema.nullable().default(null),
  lastRunId: z.string().nullable().default(null),
  lastResult: z.string().default(""),
});
export type TaskFrontmatter = z.output<typeof TaskFrontmatterSchema>;

/**
 * The order frontmatter keys are written in.
 *
 * `YAML.stringify` follows insertion order, so funnelling every write through one ordering
 * keeps task files stable in git instead of reshuffling on each save.
 */
export const FRONTMATTER_KEY_ORDER = [
  "title",
  "description",
  "agentType",
  "status",
  "priority",
  "tags",
  "steps",
  "dependsOn",
  "createdAt",
  "lastRunAt",
  "lastRunStatus",
  "lastRunId",
  "lastResult",
] as const satisfies ReadonlyArray<keyof TaskFrontmatter>;

/** Known keys first in a fixed order, then any user-authored keys, alphabetically. */
export function orderFrontmatter(frontmatter: TaskFrontmatter): Record<string, unknown> {
  const known = new Set<string>(FRONTMATTER_KEY_ORDER);
  const ordered: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) ordered[key] = frontmatter[key];
  for (const key of Object.keys(frontmatter).sort()) {
    if (!known.has(key)) ordered[key] = (frontmatter as Record<string, unknown>)[key];
  }
  return ordered;
}

export const TaskRefSchema = z.object({
  list: z.string(),
  name: z.string(),
});
export type TaskRef = z.output<typeof TaskRefSchema>;

/** Metadata-only view, used by listings and search results. `size`/`updatedAt` come from `stat`. */
export const TaskSummarySchema = z.object({
  list: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  agentType: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  tags: z.array(z.string()),
  stepCount: z.number(),
  dependsOn: z.array(z.string()),
  lastRunAt: z.string().nullable(),
  lastRunStatus: TaskRunStatusSchema.nullable(),
  /** Links a task back to its most recent tracked run, when that run is still in history. */
  lastRunId: z.string().nullable(),
  size: z.number(),
  updatedAt: z.string(),
});
export type TaskSummary = z.output<typeof TaskSummarySchema>;

export const TaskSchema = TaskSummarySchema.extend({
  body: z.string(),
  steps: z.array(z.string()),
  lastResult: z.string(),
  /** Raw frontmatter, unknown keys included, so an editor can round-trip the file. */
  frontmatter: TaskFrontmatterSchema,
});
export type Task = z.output<typeof TaskSchema>;

/**
 * The write surface for create/update.
 *
 * Narrower than the frontmatter on purpose — run bookkeeping (`lastResult`, `lastRunId`,
 * `createdAt`) is owned by the service and must not be settable by a tool or an RPC client.
 */
export const TaskInputSchema = z.object({
  title: z.string().exactOptional(),
  description: z.string().exactOptional(),
  agentType: z.string().exactOptional(),
  status: TaskStatusSchema.exactOptional(),
  priority: TaskPrioritySchema.exactOptional(),
  tags: z.array(z.string()).exactOptional(),
  steps: z.array(z.string()).exactOptional(),
  dependsOn: z.array(z.string()).exactOptional(),
  body: z.string().default(""),
});
export type TaskInput = z.input<typeof TaskInputSchema>;
export type ParsedTaskInput = z.output<typeof TaskInputSchema>;

/**
 * Spelled out rather than `z.record(TaskStatusSchema, z.number())` because the RPC schemas are
 * exported to JSON Schema, and an enum-keyed record is not reliably representable there.
 */
export const TaskStatusCountsSchema = z.object({
  pending: z.number(),
  "in-progress": z.number(),
  blocked: z.number(),
  done: z.number(),
  cancelled: z.number(),
});
export type TaskStatusCounts = z.output<typeof TaskStatusCountsSchema>;

export const TaskListSummarySchema = z.object({
  name: z.string(),
  taskCount: z.number(),
  statusCounts: TaskStatusCountsSchema,
  updatedAt: z.string(),
});
export type TaskListSummary = z.output<typeof TaskListSummarySchema>;

export const TaskRunSchema = z.object({
  id: z.string(),
  /** Set when the run belongs to a group; null for a single-task run. */
  batchId: z.string().nullable(),
  list: z.string(),
  name: z.string(),
  title: z.string(),
  agentType: z.string(),
  /** Null until the agent has been spawned. */
  agentId: z.string().nullable(),
  /** Snapshot taken at run start, so later edits to the file cannot change a running task. */
  messages: z.array(z.string()),
  currentStep: z.number(),
  status: TaskRunStatusSchema,
  message: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
});
export type TaskRun = z.output<typeof TaskRunSchema>;

export const TaskBatchSchema = z.object({
  id: z.string(),
  label: z.string(),
  list: z.string(),
  parallel: z.number(),
  runIds: z.array(z.string()),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
});
export type TaskBatch = z.output<typeof TaskBatchSchema>;

export const TaskLineMatchSchema = z.object({
  line: z.number(),
  content: z.string(),
});
export type TaskLineMatch = z.output<typeof TaskLineMatchSchema>;

export const TaskSearchMatchSchema = TaskSummarySchema.extend({
  score: z.number(),
  matchType: z.enum(["name", "content", "both"]),
  lineMatches: z.array(TaskLineMatchSchema),
});
export type TaskSearchMatch = z.output<typeof TaskSearchMatchSchema>;

export const TaskServiceConfigSchema = z
  .object({
    taskDirectory: z
      .string()
      .default("tasks")
      .meta({ description: "Directory where task lists are stored" } satisfies ConfigFieldMeta),
    defaultList: z
      .string()
      .default("default")
      .meta({ description: "Task list used when a caller does not name one" } satisfies ConfigFieldMeta),
    parallel: z
      .number()
      .int()
      .min(1)
      .default(1)
      .meta({ description: "Maximum number of tasks executed concurrently in a group run" } satisfies ConfigFieldMeta),
    maxFinishedRuns: z
      .number()
      .default(50)
      .meta({ description: "How many finished runs are retained for the run history" } satisfies ConfigFieldMeta),
    maxResultLength: z
      .number()
      .default(2000)
      .meta({ description: "Longest agent response stored back into a task's lastResult" } satisfies ConfigFieldMeta),
    writeBackStatus: z
      .boolean()
      .default(true)
      .meta({ description: "Write run status and results back into each task's frontmatter" } satisfies ConfigFieldMeta),
    defaultAgentType: z
      .string()
      .default("code")
      .meta({ description: "Agent type used for tasks that do not specify one" } satisfies ConfigFieldMeta),
    agentTypes: z
      .array(z.string())
      .default([])
      .meta({ description: "Agent types offered when choosing a task's agent; empty means all of them" } satisfies ConfigFieldMeta),
    subAgent: SubAgentConfigSchema.prefault({}),
  })
  .prefault({})
  .meta({ label: "Tasks", description: "Tasks, backed by markdown files on disk" } satisfies ConfigFieldMeta);

export type TaskServiceConfig = z.input<typeof TaskServiceConfigSchema>;
export type ParsedTaskServiceConfig = z.output<typeof TaskServiceConfigSchema>;
