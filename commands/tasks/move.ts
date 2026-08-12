import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  positionals: [
    {
      name: "from",
      description: "Task to move, as list/name",
      required: true,
    },
    {
      name: "to",
      description: "Destination, as list/name",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const from = parseTaskPath(args.from);
  const to = parseTaskPath(args.to);
  const taskService = agent.requireService(TaskService);

  const task = await taskService.moveTask(from.list, from.name, to.list, to.name);
  return `Moved task ${from.list}/${from.name} to ${task.list}/${task.name}`;
}

export default {
  name: "tasks move",
  description: "Move or rename a task",
  inputSchema,
  execute,
  help: `Move a task to another list, rename it, or both. The destination list is created if needed.

## Examples

/tasks move inbox/fix-parser refactor/fix-parser
/tasks move refactor/fix-parser refactor/extract-parser`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
