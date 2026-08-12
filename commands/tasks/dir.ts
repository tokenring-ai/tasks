import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  const lists = await taskService.listTaskLists();

  return [
    `Task directory: ${taskService.getTaskDirectory()}`,
    `Task lists: ${lists.length}`,
    `Default list: ${taskService.getDefaultList()}`,
    `Default agent type: ${taskService.getDefaultAgentType()}`,
    `Parallelism: ${taskService.getParallel()}`,
  ].join("\n");
}

export default {
  name: "tasks dir",
  description: "Show where tasks are stored and how they are configured",
  inputSchema,
  execute,
  help: `Show the resolved task directory along with the configured defaults.

## Example

/tasks dir`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
