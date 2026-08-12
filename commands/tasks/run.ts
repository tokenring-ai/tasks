import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import TaskService from "../../TaskService.ts";
import { parseTaskPath } from "../../util/taskPath.ts";

const inputSchema = {
  args: {
    wait: {
      type: "flag",
      description: "Wait for the task to finish and show its result",
    },
  },
  positionals: [
    {
      name: "path",
      description: "Task to run, as list/name",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { list, name } = parseTaskPath(args.path);
  const taskService = agent.requireService(TaskService);

  if (args.wait) {
    const outcome = await taskService.runTask({ list, name }, { headless: true, signal: agent.getAbortSignal() });
    return `Task ${list}/${name} ${outcome.status}\n\n${outcome.message}`;
  }

  // Interactive by default, so the spawned agent stays around to inspect and talk to.
  const { runId, agentId } = await taskService.spawnTask({ list, name }, { headless: false, cleanupAgent: false });
  return agentId ? `Started task ${list}/${name} on agent ${agentId} (run ${runId.slice(0, 8)})` : `Started task ${list}/${name} (run ${runId.slice(0, 8)})`;
}

export default {
  name: "tasks run",
  description: "Run one task on a newly spawned agent",
  inputSchema,
  execute,
  help: `Run a single task on a freshly spawned agent of the task's agent type.

By default the task runs in the background and the agent is left running so you can inspect it.
Pass --wait to block until the task finishes and show its result instead.

## Examples

/tasks run refactor/extract-parser
/tasks run refactor/extract-parser --wait`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
