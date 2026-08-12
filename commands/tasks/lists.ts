import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { formatTaskLists } from "./_formatTasks.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  return formatTaskLists(await taskService.listTaskLists());
}

export default {
  name: "tasks lists",
  description: "Show every task list with its task and status counts",
  inputSchema,
  execute,
  help: `Show every task list, with how many tasks each holds and how those tasks are progressing.

## Example

/tasks lists`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
