import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  positionals: [
    {
      name: "path",
      description: "Task to show, as list/name",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { list, name } = parseTaskPath(args.path);
  const taskService = agent.requireService(TaskService);
  const task = await taskService.getTask(list, name);
  if (!task) return `Task "${list}/${name}" not found`;

  const lines = [
    `# ${task.title || task.name}`,
    "",
    `- **Path:** ${task.list}/${task.name}`,
    `- **Status:** ${task.status}`,
    `- **Agent:** ${task.agentType || "(default)"}`,
    `- **Priority:** ${task.priority}`,
  ];
  if (task.tags.length > 0) lines.push(`- **Tags:** ${task.tags.join(", ")}`);
  if (task.dependsOn.length > 0) lines.push(`- **Depends on:** ${task.dependsOn.join(", ")}`);
  if (task.lastRunAt) lines.push(`- **Last run:** ${task.lastRunAt} (${task.lastRunStatus ?? "unknown"})`);
  lines.push(`- **Updated:** ${task.updatedAt}`);

  if (task.steps.length > 0) {
    lines.push("", "## Steps", ...task.steps.map((step, index) => `${index + 1}. ${step}`));
  }

  lines.push("", "## Instructions", "", task.body || "_(empty)_");

  if (task.lastResult) lines.push("", "## Last result", "", task.lastResult);

  return lines.join("\n");
}

export default {
  name: "tasks show",
  description: "Show one task's frontmatter and instructions",
  inputSchema,
  execute,
  help: `Show a single task in full, including its metadata, instructions and most recent result.

## Example

/tasks show refactor/extract-parser`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
