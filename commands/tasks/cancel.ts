import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {
  args: {
    batch: {
      type: "string",
      description: "Cancel every run in this batch",
    },
  },
  positionals: [
    {
      name: "runId",
      description: "Run to cancel; omit when using --batch",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);

  if (args.batch) {
    const cancelled = taskService.cancelBatch(args.batch);
    return cancelled > 0
      ? `Cancelled ${cancelled} run${cancelled === 1 ? "" : "s"} in batch ${args.batch.slice(0, 8)}`
      : `No in-flight runs found in that batch`;
  }

  if (!args.runId) return "Pass a run id, or --batch=<id> to cancel a whole group. See /tasks runs for ids.";

  // Run ids are shown truncated by /tasks runs, so accept a prefix.
  const match = taskService.getRuns().find(run => run.id === args.runId || run.id.startsWith(args.runId!));
  if (!match) return `Run "${args.runId}" not found`;

  return taskService.cancelRun(match.id)
    ? `Cancelled run ${match.id.slice(0, 8)} (${match.list}/${match.name})`
    : `Run ${match.id.slice(0, 8)} has already finished`;
}

export default {
  name: "tasks cancel",
  description: "Cancel an in-flight task run or batch",
  inputSchema,
  execute,
  help: `Cancel a task run that is still in flight, or every run in a batch.

Run ids may be given as the shortened form shown by /tasks runs.

## Examples

/tasks cancel 3f2a1c9e
/tasks cancel --batch=8b41d0f2-...`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
