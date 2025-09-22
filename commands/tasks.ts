import Agent from "@tokenring-ai/agent/Agent";
import TaskService from "../TaskService.ts";


import { runAgent } from "@tokenring-ai/agent/tools"

export const description =
  "/tasks [list|clear|execute] - Manage task list.";

export async function execute(remainder: string, agent: Agent) {
  const taskService = agent.requireServiceByType(TaskService);

  if (!remainder?.trim()) {
    help().forEach(line => agent.infoLine(line));
    return;
  }

  const parts = remainder.trim().split(/\s+/);
  const operation = parts[0];

  switch (operation) {
    case "list": {
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
      break;
    }

    case "clear": {
      taskService.clearTasks(agent);
      agent.infoLine("Cleared all tasks");
      break;
    }

    case "execute": {
      const tasks = taskService.getTasks(agent);
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      
      if (pendingTasks.length === 0) {
        agent.infoLine("No pending tasks to execute");
        return;
      }

      let results = [];
      
      for (const task of pendingTasks) {
        agent.infoLine(`Executing task: ${task.name}`);
        taskService.updateTaskStatus(task.id, 'running', undefined, agent);
        
        try {
          const result = await runAgent.execute({
            agentType: task.agentType,
            message: task.message,
            context: task.context
          }, agent);
          
          if (result.ok) {
            taskService.updateTaskStatus(task.id, 'completed', result.response, agent);
            results.push(`✓ ${task.name}: Completed`);
          } else {
            taskService.updateTaskStatus(task.id, 'failed', result.response || result.error, agent);
            results.push(`✗ ${task.name}: Failed - ${result.response || result.error}`);
          }
        } catch (error) {
          taskService.updateTaskStatus(task.id, 'failed', String(error), agent);
          results.push(`✗ ${task.name}: Error - ${error}`);
        }
      }
      
      agent.infoLine(`Task execution completed:\n${results.join('\n')}`);
      break;
    }

    default:
      agent.errorLine("Unknown operation");
      return;
  }
}

export function help() {
  return [
    "/tasks [list|clear|execute]",
    "  - list: shows all tasks with their status",
    "  - clear: removes all tasks from the list", 
    "  - execute: executes all pending tasks by dispatching them to agents",
  ];
}