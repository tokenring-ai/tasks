import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import TaskService from "../TaskService.ts";

const name = "task_read";
const displayName = "Tasks/read task";

async function execute({ list, name: taskName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const task = await taskService.getTask(list, taskName);

  if (!task) {
    return {
      message: `**Tasks** Task "${list}/${taskName}" not found`,
      result: JSON.stringify({ error: `Task "${list}/${taskName}" not found` }),
    };
  }

  return {
    message: `**Tasks** Read "${list}/${taskName}"`,
    result: JSON.stringify({ task }),
  };
}

const description = "Read one task in full: its frontmatter (agent type, status, priority, tags, steps) plus the markdown body that describes the work.";

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
