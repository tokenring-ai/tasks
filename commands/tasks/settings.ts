import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import {TaskState} from "../../state/taskState.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const {parallelTasks, autoApprove} = agent.getState(TaskState);
  if (!remainder.trim()) {
    return ["Task Settings:", indent([`Auto-approve: ${autoApprove}s`, `Parallel tasks: ${parallelTasks}`], 1), "", "Usage:", indent("/tasks settings auto-approve=<seconds> parallel=<number>", 1)].join("\n");
  }
  const results: string[] = [];
  for (const setting of remainder.trim().split(/\s+/)) {
    const match = setting.match(/^(auto-approve|parallel)=(.+)$/);
    if (!match) throw new CommandFailedError(`Invalid setting: ${setting}`);
    const [, key, value] = match;
    if (key === "auto-approve") {
      const seconds = parseInt(value, 10);
      if (isNaN(seconds) || seconds < 0) throw new CommandFailedError("auto-approve must be >= 0");
      agent.mutateState(TaskState, state => { state.autoApprove = seconds; });
      results.push(seconds > 0 ? `Auto-approve enabled with ${seconds}s timeout` : "Auto-approve disabled");
    } else if (key === "parallel") {
      const count = parseInt(value, 10);
      if (isNaN(count) || count < 1) throw new CommandFailedError("parallel must be >= 1");
      agent.mutateState(TaskState, state => { state.parallelTasks = count; });
      results.push(`Parallel tasks set to ${count}`);
    }
  }
  return results.join("\n");
}

export default { name: "tasks settings", description: "/tasks settings - View or modify task settings", help: `# /tasks settings [key=value...]

View or modify task settings. Omit arguments to show current settings.

## Example

/tasks settings
/tasks settings auto-approve=30
/tasks settings parallel=3
/tasks settings auto-approve=30 parallel=5`, execute } satisfies TokenRingAgentCommand;
