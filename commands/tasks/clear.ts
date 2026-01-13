import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../../TaskService.js";

export default async function clear(_remainder: string, agent: Agent): Promise<void> {
  const taskService = agent.requireServiceByType(TaskService);
  taskService.clearTasks(agent);
  agent.infoLine("Cleared all tasks");
}
