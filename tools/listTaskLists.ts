import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import TaskService from "../TaskService.ts";

const name = "task_lists";
const displayName = "Tasks/list task lists";

async function execute(_input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const lists = await taskService.listTaskLists();

  return {
    message: `**Tasks** Found ${lists.length} task list${lists.length === 1 ? "" : "s"}`,
    result: JSON.stringify({ lists }),
  };
}

const description =
  "List every task list, with how many tasks each one holds and a breakdown of their statuses. Use this to discover what work is already tracked before creating a new list.";

const inputSchema = z.object({});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
