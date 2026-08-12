import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { TaskStatusSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_search";
const displayName = "Tasks/search tasks";

async function execute({ query, list, status, limit }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const matches = await taskService.searchTasks(query, { list, status, limit });

  return {
    message: `**Tasks** Found ${matches.length} task${matches.length === 1 ? "" : "s"} matching "${query}"`,
    result: JSON.stringify({ matches }),
  };
}

const description =
  "Search tasks with a case-insensitive substring match across names, titles, descriptions, tags and bodies. Returns matching tasks with the lines that matched. Use this before writing a task to avoid duplicating work that is already tracked.";

const inputSchema = z.object({
  query: z.string().describe("Substring to search for"),
  list: z.string().describe("Restrict the search to a single task list").optional(),
  status: TaskStatusSchema.describe("Restrict the search to tasks in this status").optional(),
  limit: z.number().describe("Maximum number of tasks to return").optional(),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
