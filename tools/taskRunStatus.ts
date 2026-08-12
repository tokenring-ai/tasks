import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import type { TaskRun } from "../schema.ts";
import TaskService from "../TaskService.ts";

const name = "task_run_status";
const displayName = "Tasks/check run status";

function summarize(run: TaskRun) {
  return {
    runId: run.id,
    list: run.list,
    name: run.name,
    status: run.status,
    step: run.messages.length > 1 ? `${Math.min(run.currentStep + 1, run.messages.length)}/${run.messages.length}` : undefined,
    message: run.message,
    finished: run.finishedAt !== null,
  };
}

async function execute({ batchId, runId, list }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);

  if (runId) {
    const run = taskService.getRun(runId);
    if (!run) return { message: `**Tasks** Run "${runId}" not found`, result: JSON.stringify({ error: `Run "${runId}" not found` }) };
    return { message: `**Tasks** "${run.list}/${run.name}" is ${run.status}`, result: JSON.stringify({ run: summarize(run) }) };
  }

  if (batchId) {
    const batch = taskService.getBatch(batchId);
    if (!batch) return { message: `**Tasks** Batch "${batchId}" not found`, result: JSON.stringify({ error: `Batch "${batchId}" not found` }) };
    const runs = taskService.getRuns().filter(run => run.batchId === batchId);
    const completed = runs.filter(run => run.status === "completed").length;
    return {
      message: `**Tasks** Batch "${batch.label}": ${completed} of ${runs.length} completed${batch.finishedAt === null ? " (still running)" : ""}`,
      result: JSON.stringify({ batchId, finished: batch.finishedAt !== null, runs: runs.map(summarize) }),
    };
  }

  const runs = taskService.getRuns().filter(run => (list ? run.list === list : true));
  const active = runs.filter(run => run.finishedAt === null);
  return {
    message: `**Tasks** ${active.length} run${active.length === 1 ? "" : "s"} in flight, ${runs.length} tracked`,
    result: JSON.stringify({ runs: runs.slice(-20).map(summarize) }),
  };
}

const description =
  "Check on task execution. Pass a runId for one task, a batchId for a group started with task_run_group, or neither to see recent runs. Useful after starting work with `wait: false`, or to re-check progress after an interruption.";

const inputSchema = z.object({
  runId: z.string().describe("Check a single run").optional(),
  batchId: z.string().describe("Check every run in a group").optional(),
  list: z.string().describe("Restrict the recent-runs view to one task list").optional(),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
