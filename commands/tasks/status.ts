import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { TASK_STATUSES } from "../../schema.ts";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  positionals: [
    {
      name: "path",
      description: "Task to update, as list/name",
      required: true,
    },
    {
      name: "status",
      description: `New status: ${TASK_STATUSES.join(", ")}`,
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { list, name } = parseTaskPath(args.path);

  if (!(TASK_STATUSES as readonly string[]).includes(args.status)) {
    return `Invalid status "${args.status}". Valid statuses: ${TASK_STATUSES.join(", ")}`;
  }

  const taskService = agent.requireService(TaskService);
  const task = await taskService.setTaskStatus(list, name, args.status as (typeof TASK_STATUSES)[number]);
  return `Task ${task.list}/${task.name} is now ${task.status}`;
}

export default {
  name: "tasks status",
  description: "Change a task's status without touching its instructions",
  inputSchema,
  execute,
  help: `Change a task's board status. The task's instructions are left untouched.

Valid statuses: ${TASK_STATUSES.join(", ")}

## Example

/tasks status refactor/extract-parser done`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
