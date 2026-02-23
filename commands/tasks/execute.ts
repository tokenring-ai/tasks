import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../../TaskService.js";

export default async function execute(_remainder: string, agent: Agent): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);
  const tasks = taskService.getTasks(agent);
  const pendingTasks = tasks.filter(t => t.status === 'pending');

  if (pendingTasks.length === 0) {
    return "No pending tasks to execute";
  }

  const taskIds = pendingTasks.map(t => t.id);
  const results = await taskService.executeTasks(taskIds, agent);

  return `Task execution completed:\n${results.join('\n')}`;
}
