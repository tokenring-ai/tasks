import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import TaskService from "../TaskService.ts";

const description =
  "/tasks - Manage and execute tasks in the task queue.";

async function execute(remainder: string, agent: Agent) {
  const taskService = agent.requireServiceByType(TaskService);

  if (!remainder?.trim()) {
    agent.chatOutput(help);
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

      const taskIds = pendingTasks.map(t => t.id);
      const results = await taskService.executeTasks(taskIds, agent);

      agent.infoLine(`Task execution completed:\n${results.join('\n')}`);
      break;
    }

    case "auto-approve": {
      const seconds = parseInt(parts[1], 10);
      if (isNaN(seconds) || seconds < 0) {
        agent.errorLine("Usage: /tasks auto-approve [seconds >= 0]");
      } else {
        taskService.setAutoApprove(seconds, agent);
        agent.infoLine(seconds > 0 ? `Auto-approve enabled with ${seconds}s timeout` : "Auto-approve disabled");
      }
      break;
    }

    case "parallel": {
      const count = parseInt(parts[1], 10);
      if (isNaN(count) || count < 1) {
        agent.errorLine("Usage: /tasks parallel [number >= 1]");
      } else {
        taskService.setParallelTasks(count, agent);
        agent.infoLine(`Parallel tasks set to ${count}`);
      }
      break;
    }

    default:
      agent.errorLine("Unknown operation");
      return;
  }
}

const help: string = `# TASKS COMMAND

## Usage

/tasks [operation]

Manage and execute tasks in the task queue. This command allows you to view, clear, and execute tasks that have been queued for processing by different agents in the system.

## Available Operations

### list

Display all tasks in the current task queue with their status, agent type, and message content.

**Example:**
/tasks list

**Output:**
Current tasks:
[0] Process Data (pending)
    Agent: data-processor
    Message: Process the uploaded CSV file
[1] Send Email (completed)
    Agent: email-sender
    Message: Send confirmation email to user@example.com

### clear

Remove all tasks from the current task queue. This action cannot be undone.

**Example:**
/tasks clear

**Output:** Cleared all tasks

### execute

Execute all pending tasks by dispatching them to their respective agents. Only tasks with 'pending' status will be executed.

**Example:**
/tasks execute

**Output:**
Task execution completed:
Task #123 executed successfully by data-processor
Task #456 executed successfully by email-sender

### auto-approve

Set the timeout in seconds before tasks are automatically approved. Set to 0 to disable auto-approval.

**Example:**
/tasks auto-approve 30
/tasks auto-approve 0

### parallel

Set the number of tasks that can run in parallel (default: 1).

**Example:**
/tasks parallel 3

## Common Use Cases

- View current workload: \`/tasks list\`
- Clean up completed tasks: \`/tasks clear\`
- Process pending work: \`/tasks execute\`
- Enable auto-execution: \`/tasks auto-approve 30\`
- Run multiple tasks simultaneously: \`/tasks parallel 5\`

**Note:** The execute operation will only process tasks with 'pending' status. Completed or failed tasks will remain in the queue until manually cleared.`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;