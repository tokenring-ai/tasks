import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import indent from "@tokenring-ai/utility/string/indent";
import {TaskState} from "../../../state/taskState.ts";
import TaskService from "../../../TaskService.js";

export default async function defaultCmd(remainder: string, agent: Agent): Promise<string> {
  const taskService = agent.requireServiceByType(TaskService);

  const { parallelTasks, autoApprove, tasks } = agent.getState(TaskState);
  
  if (!remainder.trim()) {
    const lines: string[] = [
      "Task Settings:",
      indent([
        `Auto-approve: ${autoApprove}s`,
        `Parallel tasks: ${parallelTasks}`
      ], 1),
      "",
      "Usage:",
      indent("/tasks settings auto-approve=<seconds> parallel=<number>", 1)
    ];
    return lines.join("\n");
  }

  const settings = remainder.trim().split(/\s+/);
  const results: string[] = [];
  
  for (const setting of settings) {
    const match = setting.match(/^(auto-approve|parallel)=(.+)$/);
    if (!match) {
      throw new CommandFailedError(`Invalid setting: ${setting}`);
    }

    const [, key, value] = match;

    if (key === "auto-approve") {
      const seconds = parseInt(value, 10);
      if (isNaN(seconds) || seconds < 0) {
        throw new CommandFailedError("auto-approve must be >= 0");
      } else {
        agent.mutateState(TaskState, state => {
          state.autoApprove = seconds;
        });
        results.push(seconds > 0 ? `Auto-approve enabled with ${seconds}s timeout` : "Auto-approve disabled");
      }
    } else if (key === "parallel") {
      const count = parseInt(value, 10);
      if (isNaN(count) || count < 1) {
        throw new CommandFailedError("parallel must be >= 1");
      } else {
        agent.mutateState(TaskState, state => {
          state.parallelTasks = count;
        });
        results.push(`Parallel tasks set to ${count}`);
      }
    }
  }

  return results.join("\n");
}
