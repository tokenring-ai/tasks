import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({ agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);
  const pending = taskService.getTasks(agent).filter(t => t.status === "pending");
  if (pending.length === 0) return "No pending tasks to execute";
  const results = await taskService.executeTasks(
    pending.map(t => t.id),
    agent,
  );
  return `Task execution completed:\n${results.join("\n")}`;
}

export default {
  name: "tasks execute",
  description: "Execute pending tasks",
  help: `Execute all pending tasks in the task queue.

## Example

/tasks execute`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
