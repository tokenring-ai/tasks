import type { Agent } from "@tokenring-ai/agent";
import { type ParsedSubAgentConfig, SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import { AgentStateSlice } from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import { z } from "zod";
import type { TaskServiceConfigSchema } from "../schema.ts";

export interface Task {
  id: string;
  name: string;
  agentType: string;
  message: string;
  context: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

const serializationSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      agentType: z.string(),
      message: z.string(),
      context: z.string(),
      status: z.enum(["pending", "running", "completed", "failed"]),
      result: z.string().exactOptional(),
    }),
  ),
  autoApprove: z.number(),
  parallelTasks: z.number(),
  allowedSubAgents: z.array(z.string()),
  subAgent: SubAgentConfigSchema,
});

export class TaskState extends AgentStateSlice<typeof serializationSchema> {
  readonly tasks: Task[] = [];
  autoApprove: number;
  parallelTasks: number;
  allowedSubAgents: string[];
  subAgent: ParsedSubAgentConfig;

  constructor(readonly initialConfig: z.output<typeof TaskServiceConfigSchema>["agentDefaults"]) {
    super("TaskState", serializationSchema);
    this.autoApprove = initialConfig.autoApprove;
    this.parallelTasks = initialConfig.parallel;
    this.allowedSubAgents = initialConfig.allowedSubAgents;
    this.subAgent = initialConfig.subAgent;
  }

  transferStateFromParent(agent: Agent) {
    /* TODO: The todo list is shared with the parent agent by sharing a reference to the same array
     * This is extremely fragile and should be revisited. We set it to readonly to try and prevent
     * the array from being replaced
     */
    (this.tasks as any) = agent.getState(TaskState).tasks;
  }

  reset(): void {
    this.tasks.splice(0, this.tasks.length);
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      tasks: this.tasks,
      autoApprove: this.autoApprove,
      parallelTasks: this.parallelTasks,
      allowedSubAgents: this.allowedSubAgents,
      subAgent: this.subAgent,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    if (data.tasks) {
      this.tasks.splice(0, data.tasks.length, ...data.tasks);
    }

    this.autoApprove = data.autoApprove;
    this.parallelTasks = data.parallelTasks;
    this.allowedSubAgents = data.allowedSubAgents;
    this.subAgent = data.subAgent;
  }

  show(): string {
    const statusCounts = this.tasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return `Total Tasks: ${this.tasks.length}
${markdownList(Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`))}
Auto-approve: ${this.autoApprove > 0 ? `${this.autoApprove}s` : "disabled"}
Parallel tasks: ${this.parallelTasks}
Allowed sub-agents: ${this.allowedSubAgents.length > 0 ? this.allowedSubAgents.join(", ") : "none"}`;
  }
}
