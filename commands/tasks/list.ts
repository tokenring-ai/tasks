import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../../TaskService.js";

export default async function list(_remainder: string, agent: Agent): Promise<void> {
  const taskService = agent.requireServiceByType(TaskService);
  const tasks = taskService.getTasks(agent);
  
  if (tasks.length === 0) {
    agent.infoLine("No tasks in the list");
    return;
  }

  agent.infoLine("Current tasks:");
  tasks.forEach((task, index) => {
    agent.infoLine(`[${index}] ${task.name} (${task.status})`);
    agent.infoLine(`    Agent: ${task.agentType}`);
    agent.infoLine(`    Message: ${task.message}`);
    if (task.result) {
      agent.infoLine(`    Result: ${task.result.substring(0, 100)}...`);
    }
  });
}
