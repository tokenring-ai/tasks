import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "tasks clear",
  description: "Clear all tasks",
  help: `Remove all tasks from the current task queue.

## Example

/tasks clear`,
  inputSchema,
  execute: ({
              agent,
            }: AgentCommandInputType<typeof inputSchema>): string => {
    agent.requireServiceByType(TaskService).clearTasks(agent);
    return "Cleared all tasks";
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
