import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { TASK_STATUSES } from "../../schema.ts";
import TaskService from "../../TaskService.ts";

const inputSchema = {
  args: {
    status: {
      type: "enum",
      values: TASK_STATUSES,
      description: "Status used to select tasks when --names is not given",
      defaultValue: "pending",
    },
    names: {
      type: "string",
      description: "Comma-separated task names to run instead of selecting by status",
    },
    parallel: {
      type: "number",
      description: "Maximum tasks to run at once",
      minimum: 1,
    },
    wait: {
      type: "flag",
      description: "Wait for every task to finish and summarize the results",
    },
  },
  positionals: [
    {
      name: "list",
      description: "Task list to run tasks from",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const taskService = agent.requireService(TaskService);

  const explicit = args.names
    ?.split(",")
    .map(name => name.trim())
    .filter(name => name !== "");
  const selected = explicit?.length ? explicit : (await taskService.listTasks(args.list, { status: args.status })).map(task => task.name);

  if (selected.length === 0) return `No ${args.status} tasks found in list "${args.list}"`;

  const refs = selected.map(name => ({ list: args.list, name }));
  const options = { headless: true, parallel: args.parallel, label: `${args.list} (${selected.length} tasks)` };

  if (!args.wait) {
    const batchId = taskService.spawnTasks(refs, options);
    return `Started ${selected.length} task${selected.length === 1 ? "" : "s"} from "${args.list}" (batch ${batchId.slice(0, 8)}). Track them with /tasks runs --batch=${batchId}`;
  }

  const { outcomes } = await taskService.runTasks(refs, { ...options, signal: agent.getAbortSignal() });
  const completed = outcomes.filter(outcome => outcome.status === "completed").length;
  const lines = outcomes.map(outcome => `- ${outcome.list}/${outcome.name}: ${outcome.status}`);

  return `${completed} of ${outcomes.length} tasks completed in "${args.list}"\n\n${lines.join("\n")}`;
}

export default {
  name: "tasks run-group",
  description: "Run several tasks from one list, in parallel",
  inputSchema,
  execute,
  help: `Run several tasks from one list, each on its own agent, up to --parallel at a time.

Tasks in a group run concurrently and cannot see each other's work, so only group tasks that are
independent. Schedule dependent work as a follow-up group.

## Examples

/tasks run-group refactor
/tasks run-group refactor --parallel=3 --wait
/tasks run-group refactor --names=extract-parser,add-tests`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
