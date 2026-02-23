import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../../TaskService.js";

export default async function clear(_remainder: string, agent: Agent): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);
  taskService.clearTasks(agent);
  return "Cleared all tasks";
}
