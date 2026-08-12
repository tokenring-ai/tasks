import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {
  positionals: [
    {
      name: "list",
      description: "Name of the task list to delete",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  const tasks = await taskService.listTasks(args.list);
  const success = await taskService.deleteTaskList(args.list);

  if (!success) return `Task list "${args.list}" not found`;
  return `Deleted task list "${args.list}" and its ${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
}

export default {
  name: "tasks delete-list",
  description: "Delete a task list and every task in it",
  inputSchema,
  execute,
  help: `Delete a task list, removing its directory and every task file inside it.

## Example

/tasks delete-list refactor`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
