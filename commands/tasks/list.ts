import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import TaskService from "../../TaskService.js";

async function execute(_remainder: string, agent: Agent): Promise<string> {
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

export default { name: "tasks list", description: "/tasks list - List all tasks", help: `# /tasks list

Display all tasks in the current task queue with their status and details.

## Example

/tasks list`, execute } satisfies TokenRingAgentCommand;
