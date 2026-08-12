import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {
  positionals: [
    {
      name: "list",
      description: "Name of the task list to create",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  const list = await taskService.createTaskList(args.list);
  return `Created task list "${list.name}"`;
}

export default {
  name: "tasks create-list",
  description: "Create an empty task list",
  inputSchema,
  execute,
  help: `Create an empty task list. Writing a task into a list creates it automatically, so this is
only needed to set one up ahead of time.

## Example

/tasks create-list refactor`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
