import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import {z} from "zod";
import TaskService from "../TaskService.ts";

const name = "tasks/run";

async function execute(
  {tasks}: z.infer<typeof inputSchema>,
  agent: Agent
): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);

  if (!tasks || tasks.length === 0) {
    throw new Error(`[${name}] Missing task plan`);
  }

  // Present task plan to user
  const taskPlan = tasks.map((task, i) =>
    `${i + 1}. ${task.taskName} (${task.agentType})\n   ${task.message}`
  ).join('\n\n');

  const approved = await agent.askHuman({
    type: 'askForConfirmation',
    message: `Task Plan:\n\n${taskPlan}\n\nApprove this task plan for execution?`
  });

  if (!approved) {
    const reason = await agent.askHuman({
      type: 'ask',
      message: 'Please explain why you are rejecting this task plan:'
    });
    return `Task plan rejected. Reason: ${reason}`;
  }

  // Add tasks and execute immediately
  const taskIds = [];
  for (const task of tasks) {
    const taskId = taskService.addTask({
      name: task.taskName,
      agentType: task.agentType,
      message: task.message,
      context: task.context
    }, agent);
    taskIds.push(taskId);
  }

  // Execute all tasks
  const results = await taskService.executeTasks(taskIds, agent);

  return `Task plan executed:\n${results.join('\n')}`;
}

const description =
  "Create and present a complete task plan to the user for approval. If approved, this will execute all tasks immediately and return results. If not approved, this will return a reason for rejection.";

const inputSchema = z.object({
  tasks: z.array(z.object({
    taskName: z.string().describe("A descriptive name for the task"),
    agentType: z.string().describe("The type of agent that should handle this task"),
    message: z.string().describe("A one paragraph message/description of what needs to be done, to send to the agent."),
    context: z.string().describe("Three paragraphs of important contextual information to pass to the agent, such as file names, step by step instructions, descriptions, etc. of the exact steps the agent should take. This information is critical to proper agent functionality, and should be detailed and comprehensive. It needs to explain absolutely every aspect of how to complete the task to the agent that will be dispatched")
  })).describe("Array of tasks to add to the task list"),
});

export default {
  name, description, inputSchema, execute,
} as TokenRingToolDefinition<typeof inputSchema>;