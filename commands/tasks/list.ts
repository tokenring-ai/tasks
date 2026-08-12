import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { TASK_STATUSES } from "../../schema.ts";
import TaskService from "../../TaskService.ts";
import { formatTasks } from "./_formatTasks.ts";

const inputSchema = {
  args: {
    status: {
      type: "enum",
      values: TASK_STATUSES,
      description: "Only show tasks in this status",
    },
    tag: {
      type: "string",
      description: "Only show tasks carrying this tag",
    },
  },
  positionals: [
    {
      name: "list",
      description: "Task list to show; omit to show tasks from every list",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  const filter = { status: args.status, tag: args.tag };
  const tasks = args.list ? await taskService.listTasks(args.list, filter) : await taskService.listAllTasks(filter);

  return formatTasks(tasks, args.list ? `list "${args.list}"` : "any list");
}

export default {
  name: "tasks list",
  description: "List tasks, optionally filtered by list, status or tag",
  inputSchema,
  execute,
  help: `List tasks with their status, agent type and tags.

## Examples

/tasks list
/tasks list refactor
/tasks list refactor --status=pending
/tasks list --tag=backend`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
