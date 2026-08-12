import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import TaskService from "../TaskService.ts";

const name = "task_delete";
const displayName = "Tasks/delete task";

async function execute({ list, name: taskName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const success = await taskService.deleteTask(list, taskName);

  return {
    message: success ? `**Tasks** Deleted "${list}/${taskName}"` : `**Tasks** Task "${list}/${taskName}" not found`,
    result: JSON.stringify({ success }),
  };
}

const description =
  "Delete a task, removing its markdown file from disk. Prefer setting a task's status to cancelled when a record of the work is still useful.";

const inputSchema = z.object({
  list: z.string().describe("Task list the task belongs to"),
  name: z.string().describe("Name of the task, without the .md extension"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
