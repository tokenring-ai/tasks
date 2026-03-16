import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.js";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);
  const pending = taskService.getTasks(agent).filter(t => t.status === 'pending');
  if (pending.length === 0) return "No pending tasks to execute";
  const results = await taskService.executeTasks(pending.map(t => t.id), agent);
  return `Task execution completed:\n${results.join('\n')}`;
}

export default {
  name: "tasks execute", description: "Execute pending tasks", help: `# /tasks execute

Execute all pending tasks in the task queue.

## Example

/tasks execute`, execute } satisfies TokenRingAgentCommand;
