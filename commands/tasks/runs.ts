import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { formatRuns } from "./_formatTasks.ts";

const inputSchema = {
  args: {
    batch: {
      type: "string",
      description: "Only show runs belonging to this batch",
    },
    list: {
      type: "string",
      description: "Only show runs for tasks in this list",
    },
    limit: {
      type: "number",
      description: "Maximum number of runs to show",
      defaultValue: 20,
      minimum: 1,
    },
  },
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);

  let runs = taskService.getRuns();
  if (args.batch) runs = runs.filter(run => run.batchId === args.batch);
  if (args.list) runs = runs.filter(run => run.list === args.list);

  // Newest last matches how the runs accumulate, so show the tail.
  return formatRuns(runs.slice(-args.limit));
}

export default {
  name: "tasks runs",
  description: "Show recent task runs and their progress",
  inputSchema,
  execute,
  help: `Show recent task runs, including any still in flight.

## Examples

/tasks runs
/tasks runs --list=refactor
/tasks runs --batch=3f2a1c9e-...`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
