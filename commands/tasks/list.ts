import Agent from "@tokenring-ai/agent/Agent";
import indent from "@tokenring-ai/utility/string/indent";
import TaskService from "../../TaskService.js";

export default async function list(_remainder: string, agent: Agent): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);
  const tasks = taskService.getTasks(agent);
  
  if (tasks.length === 0) {
    return "No tasks in the list";
  }

  const lines: string[] = ["Current tasks:"];
  tasks.forEach((task, index) => {
    lines.push(`[${index}] ${task.name} (${task.status})`);
    lines.push(indent([
      `Agent: ${task.agentType}`,
      `Message: ${task.message}`
    ], 2));
    if (task.result) {
      lines.push(indent(`Result: ${task.result.substring(0, 100)}...`, 2));
    }
  });
  return lines.join("\n");
}
