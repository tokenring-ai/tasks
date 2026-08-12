import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { TaskStatusSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_list";
const displayName = "Tasks/list tasks";

async function execute({ list, status, tag, limit }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const filter = { status, tag };
  const tasks = list ? await taskService.listTasks(list, filter) : await taskService.listAllTasks(filter);
  const limited = limit ? tasks.slice(0, limit) : tasks;

  return {
    message: `**Tasks** Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}${list ? ` in "${list}"` : ""}`,
    result: JSON.stringify({ tasks: limited, total: tasks.length }),
  };
}

const description =
  "List tasks with their status, agent type, priority and tags. Omit `list` to search every task list at once. This returns metadata only — use task_read to see a task's full instructions.";

const inputSchema = z.object({
  list: z.string().describe("Task list to read; omit to list tasks across every list").optional(),
  status: TaskStatusSchema.describe("Only return tasks in this status").optional(),
  tag: z.string().describe("Only return tasks carrying this tag").optional(),
  limit: z.number().describe("Maximum number of tasks to return").optional(),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
