import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { formatTaskMatches } from "./_formatTasks.ts";

const inputSchema = {
  args: {
    list: {
      type: "string",
      description: "Restrict the search to a single task list",
    },
    limit: {
      type: "number",
      description: "Maximum number of tasks to return",
      defaultValue: 10,
      minimum: 1,
    },
  },
  remainder: {
    name: "query",
    description: "Substring to search for",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

async function execute({ args, remainder, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);
  const matches = await taskService.searchTasks(remainder, { list: args.list, limit: args.limit });

  return formatTaskMatches(matches);
}

export default {
  name: "tasks search",
  description: "Search task names, titles and instructions for a substring",
  inputSchema,
  execute,
  help: `Search tasks for a case-insensitive substring across names, titles, descriptions, tags and instructions.

## Examples

/tasks search parser
/tasks search --list=refactor parser
/tasks search --limit=3 authentication`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
