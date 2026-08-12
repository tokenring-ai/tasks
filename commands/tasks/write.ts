import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { TASK_STATUSES } from "../../schema.ts";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  args: {
    agent: {
      type: "string",
      description: "Agent type that should execute this task",
    },
    status: {
      type: "enum",
      values: TASK_STATUSES,
      description: "Board status for the task",
    },
    priority: {
      type: "enum",
      values: ["low", "normal", "high", "urgent"],
      description: "Relative priority",
    },
    title: {
      type: "string",
      description: "Short human-readable title",
    },
  },
  positionals: [
    {
      name: "path",
      description: "Task to write, as list/name",
      required: true,
    },
  ],
  remainder: {
    name: "body",
    description: "Markdown instructions for the agent",
    required: true,
  },
} as const satisfies AgentCommandInputSchema;

async function execute({ args, remainder, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { list, name } = parseTaskPath(args.path);
  const taskService = agent.requireService(TaskService);

  const task = await taskService.updateTask(list, name, {
    ...stripUndefinedKeys({ agentType: args.agent, status: args.status, priority: args.priority, title: args.title }),
    body: remainder,
  });

  return `Saved task ${task.list}/${task.name} (${task.status}, agent ${task.agentType || "default"})`;
}

export default {
  name: "tasks write",
  description: "Create or overwrite a task",
  inputSchema,
  execute,
  help: `Create or overwrite a task. The task list is created automatically if needed.

The body becomes the instruction sent to the agent, so it must be self-contained — the agent
starts with no conversation history and cannot ask questions.

## Examples

/tasks write refactor/extract-parser --agent=code Extract the argument parser from cli/src/main.rs into its own module
/tasks write refactor/add-tests --agent=code --priority=high Add unit tests covering the new parser module`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
