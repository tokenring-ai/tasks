import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { TaskStatusSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_run_group";
const displayName = "Tasks/run task group";

async function execute({ list, names, status, parallel, label, wait }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);

  const selected = names?.length ? names : (await taskService.listTasks(list, { status })).map(task => task.name);
  if (selected.length === 0) {
    const message = `No ${status} tasks found in list "${list}"`;
    return { message: `**Tasks** ${message}`, result: JSON.stringify({ error: message }) };
  }

  const refs = selected.map(taskName => ({ list, name: taskName }));
  const options = { headless: true, parallel, label: label ?? `${list} (${selected.length} tasks)`, parentAgent: agent };

  if (!wait) {
    const batchId = taskService.spawnTasks(refs, options);
    return {
      message: `**Tasks** Started ${selected.length} task${selected.length === 1 ? "" : "s"} from "${list}" in the background`,
      result: JSON.stringify({ batchId, tasks: selected }),
    };
  }

  // Linking the caller's abort signal means interrupting this turn cancels the whole batch.
  const { batchId, outcomes } = await taskService.runTasks(refs, { ...options, signal: agent.getAbortSignal() });

  const completed = outcomes.filter(outcome => outcome.status === "completed").length;
  const attachments: NonNullable<TokenRingToolResult["attachments"]> = outcomes.map(outcome => ({
    name: `${outcome.list}/${outcome.name}`,
    description: `Result of task ${outcome.list}/${outcome.name} (${outcome.status})`,
    encoding: "text",
    mimeType: "text/markdown",
    body: outcome.message,
    sendToLLM: true,
  }));

  return {
    message: `**Tasks** ${completed} of ${outcomes.length} task${outcomes.length === 1 ? "" : "s"} completed in "${list}"`,
    result: JSON.stringify({
      batchId,
      outcomes: outcomes.map(({ runId, name: taskName, status: runStatus }) => ({ runId, name: taskName, status: runStatus })),
    }),
    attachments,
  };
}

const description = `Execute several tasks from one list, each on its own freshly spawned agent, running up to \`parallel\` of them at a time.

By default this runs every pending task in the list; pass \`names\` to choose specific ones. Each task's response comes back as a separate attachment.

Tasks in a single group must be independent — they run concurrently and cannot see each other's work. Schedule dependent work as a follow-up group. This does not ask the user for confirmation, so confirm the plan in conversation first.`;

const inputSchema = z.object({
  list: z.string().describe("Task list to run tasks from"),
  names: z.array(z.string()).describe("Specific task names to run; omit to run every task matching `status`").optional(),
  status: TaskStatusSchema.default("pending").describe("Status used to select tasks when `names` is omitted"),
  parallel: z.number().describe("Maximum tasks to run at once; defaults to the configured value").optional(),
  label: z.string().describe("Human-readable label for this batch, shown in the dashboard").optional(),
  wait: z.boolean().default(true).describe("Wait for every task to finish and return their results"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers: ["available-agents"],
} satisfies TokenRingToolDefinition<typeof inputSchema>;
