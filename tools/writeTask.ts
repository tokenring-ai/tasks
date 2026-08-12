import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { TaskPrioritySchema, TaskStatusSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_write";
const displayName = "Tasks/write task";

async function execute({ list, name: taskName, body, ...fields }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  // The input's optional fields are exactOptional on the service side, so absent keys must be
  // dropped rather than passed through as explicit undefined.
  const task = await taskService.updateTask(list, taskName, { ...stripUndefinedKeys(fields), body });

  return {
    message: `**Tasks** Saved "${list}/${taskName}"`,
    result: JSON.stringify({ list: task.list, name: task.name, status: task.status, agentType: task.agentType, updatedAt: task.updatedAt }),
  };
}

const description = `Create or overwrite a task. The task list is created automatically if it does not exist.

The body is the instruction sent to the agent when the task runs, so it must be self-contained: the agent starts with no conversation history and cannot ask questions. Include every file path, specification and piece of context it needs.

Supply \`steps\` only when the work must be driven as a sequence of separate messages; otherwise leave it empty and put everything in the body.`;

const inputSchema = z.object({
  list: z.string().describe("Task list to write into; created automatically if missing"),
  name: z.string().describe("Name of the task, without the .md extension"),
  body: z.string().describe("Markdown instructions for the agent — self-contained, since the agent cannot ask follow-up questions"),
  title: z.string().describe("Short human-readable title").optional(),
  description: z.string().describe("One-line summary shown in listings").optional(),
  agentType: z.string().describe("Agent type that should execute this task").optional(),
  status: TaskStatusSchema.describe("Board status; defaults to pending for a new task").optional(),
  priority: TaskPrioritySchema.describe("Relative priority").optional(),
  tags: z.array(z.string()).describe("Tags used for filtering").optional(),
  steps: z.array(z.string()).describe("Optional message sequence sent one at a time, replacing the body as the instruction").optional(),
  dependsOn: z.array(z.string()).describe("Names of tasks in the same list that should complete first").optional(),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  // Without this the model has no idea which agentType values actually exist.
  requiredContextHandlers: ["available-agents"],
} satisfies TokenRingToolDefinition<typeof inputSchema>;
