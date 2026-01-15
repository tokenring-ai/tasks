import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../../TaskService.js";

export default async function execute(_remainder: string, agent: Agent): Promise<void> {
  const taskService = agent.requireServiceByType(TaskService);
  const tasks = taskService.getTasks(agent);
  const pendingTasks = tasks.filter(t => t.status === 'pending');

  if (pendingTasks.length === 0) {
    agent.infoMessage("No pending tasks to execute");
    return;
  }

  const taskIds = pendingTasks.map(t => t.id);
  const results = await taskService.executeTasks(taskIds, agent);

  agent.infoMessage(`Task execution completed:\n${results.join('\n')}`);
}
