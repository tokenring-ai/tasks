import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import TaskService from "../../TaskService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

async function execute({agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const tasks = agent.requireServiceByType(TaskService).getTasks(agent);
  if (tasks.length === 0) return "No tasks in the list";
  const lines = ["Current tasks:"];
  tasks.forEach((task, index) => {
    lines.push(`[${index}] ${task.name} (${task.status})`);
    lines.push(indent([`Agent: ${task.agentType}`, `Message: ${task.message}`], 2));
    if (task.result) lines.push(indent(`Result: ${task.result.substring(0, 100)}...`, 2));
  });
  return lines.join("\n");
}

export default {
  name: "tasks list",
  description: "List all tasks",
  help: `Display all tasks in the current task queue with their status and details.

## Example

/tasks list`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
