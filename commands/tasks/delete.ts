import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  positionals: [
    {
      name: "path",
      description: "Task to delete, as list/name",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { list, name } = parseTaskPath(args.path);
  const taskService = agent.requireService(TaskService);
  const success = await taskService.deleteTask(list, name);

  return success ? `Deleted task ${list}/${name}` : `Task "${list}/${name}" not found`;
}

export default {
  name: "tasks delete",
  description: "Delete a task file",
  inputSchema,
  execute,
  help: `Delete a task, removing its markdown file from disk.

Consider /tasks status <path> cancelled instead when a record of the work is still useful.

## Example

/tasks delete refactor/extract-parser`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
