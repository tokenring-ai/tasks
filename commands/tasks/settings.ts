import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import { TaskState } from "../../state/taskState.ts";

const inputSchema = {
  args: {},
  remainder: { name: "settings", description: "Settings as key=value pairs" },
} as const satisfies AgentCommandInputSchema;

function execute({ remainder, agent }: AgentCommandInputType<typeof inputSchema>): string {
  const { parallelTasks, autoApprove } = agent.getState(TaskState);
  if (!remainder) {
    return [
      "Task Settings:",
      indent([`Auto-approve: ${autoApprove}s`, `Parallel tasks: ${parallelTasks}`], 1),
      "",
      "Usage:",
      indent("/tasks settings auto-approve=<seconds> parallel=<number>", 1),
    ].join("\n");
  }
  const results: string[] = [];
  for (const setting of remainder.trim().split(/\s+/)) {
    const match = setting.match(/^(auto-approve|parallel)=(.+)$/);
    if (!match) throw new CommandFailedError(`Invalid setting: ${setting}`);
    const [, key, value] = match;
    if (key === "auto-approve") {
      const seconds = parseInt(value, 10);
      if (Number.isNaN(seconds) || seconds < 0) throw new CommandFailedError("auto-approve must be >= 0");
      agent.mutateState(TaskState, state => {
        state.autoApprove = seconds;
      });
      results.push(seconds > 0 ? `Auto-approve enabled with ${seconds}s timeout` : "Auto-approve disabled");
    } else if (key === "parallel") {
      const count = parseInt(value, 10);
      if (Number.isNaN(count) || count < 1) throw new CommandFailedError("parallel must be >= 1");
      agent.mutateState(TaskState, state => {
        state.parallelTasks = count;
      });
      results.push(`Parallel tasks set to ${count}`);
    }
  }
  return results.join("\n");
}

export default {
  name: "tasks settings",
  description: "View or modify task settings",
  help: `View or modify task settings. Omit arguments to show current settings.

## Example

/tasks settings
/tasks settings auto-approve=30
/tasks settings parallel=3`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
