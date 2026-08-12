import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import TaskService from "../TaskService.ts";

const name = "task_run";
const displayName = "Tasks/run task";

async function execute({ list, name: taskName, wait }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const taskService = agent.requireService(TaskService);
  const ref = { list, name: taskName };

  if (!wait) {
    const { runId, agentId } = await taskService.spawnTask(ref, { headless: true, parentAgent: agent });
    return {
      message: `**Tasks** Started "${list}/${taskName}" in the background`,
      result: JSON.stringify({ runId, agentId, status: "running" }),
    };
  }

  const outcome = await taskService.runTask(ref, {
    headless: true,
    parentAgent: agent,
    signal: agent.getAbortSignal(),
  });

  return {
    message: `**Tasks** "${list}/${taskName}" ${outcome.status}`,
    result: JSON.stringify({ runId: outcome.runId, status: outcome.status }),
    attachments: [
      {
        name: `${list}/${taskName}`,
        description: `Result of task ${list}/${taskName} (${outcome.status})`,
        encoding: "text",
        mimeType: "text/markdown",
        body: outcome.message,
        sendToLLM: true,
      },
    ],
  };
}

const description = `Execute one task on a freshly spawned agent of the task's agent type.

The agent receives the task's body as its instruction, or its \`steps\` one message at a time when the task defines them. With \`wait\` set (the default) this returns the agent's response; otherwise it returns a run id you can poll with task_run_status.

This does not ask the user for confirmation — confirm the plan in conversation first if the work is significant.`;

const inputSchema = z.object({
  list: z.string().describe("Task list the task belongs to"),
  name: z.string().describe("Name of the task, without the .md extension"),
  wait: z.boolean().default(true).describe("Wait for the task to finish and return its result"),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers: ["available-agents"],
} satisfies TokenRingToolDefinition<typeof inputSchema>;
