import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import { TaskStatusSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_set_status";
const displayName = "Tasks/set task status";

async function execute({ list, name: taskName, status }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);

  try {
    const task = await taskService.setTaskStatus(list, taskName, status);
    return {
      message: `**Tasks** "${list}/${taskName}" is now ${status}`,
      result: JSON.stringify({ list: task.list, name: task.name, status: task.status }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { message: `**Tasks** ${message}`, result: JSON.stringify({ error: message }) };
  }
}

const description =
  "Change a task's status without touching its instructions. Prefer this over task_write when only the status changes, so a body edit cannot be clobbered.";

const inputSchema = z.object({
  list: z.string().describe("Task list the task belongs to"),
  name: z.string().describe("Name of the task, without the .md extension"),
  status: TaskStatusSchema.describe("New board status for the task"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
