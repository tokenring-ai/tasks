import type { ContextHandlerOptions, ContextItem } from "@tokenring-ai/chat/schema";
import TaskService from "../TaskService.ts";

export default function* getContextItems({ agent }: ContextHandlerOptions): Generator<ContextItem> {
  const taskService = agent.requireServiceByType(TaskService);

  const tasks = taskService.getTasks(agent);
  if (tasks.length > 0) {
    const taskSummary = tasks.map(t => `- ${t.name} (${t.status}): ${t.agentType} - ${t.message}`).join("\n");

    yield {
      role: "user",
      content: `/* The user has approved the following task plan */:\n${taskSummary}`,
    };
  }
}
