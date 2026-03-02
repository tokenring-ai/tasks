import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.js";

export default {
  name: "tasks clear",
  description: "/tasks clear - Clear all tasks",
  help: `# /tasks clear

Remove all tasks from the current task queue.

## Example

/tasks clear`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    agent.requireServiceByType(TaskService).clearTasks(agent);
    return "Cleared all tasks";
  },
} satisfies TokenRingAgentCommand;
