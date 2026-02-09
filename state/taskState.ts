import {Agent} from "@tokenring-ai/agent";
import {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";
import {z} from "zod";
import {TaskServiceConfigSchema} from "../schema.ts";

export interface Task {
  id: string;
  name: string;
  agentType: string;
  message: string;
  context: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

const serializationSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    agentType: z.string(),
    message: z.string(),
    context: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    result: z.string().optional()
  })),
  autoApprove: z.number(),
  parallelTasks: z.number()
});

export class TaskState implements AgentStateSlice<typeof serializationSchema> {
  readonly name = "TaskState";
  serializationSchema = serializationSchema;
  readonly tasks: Task[] = [];
  autoApprove: number;
  parallelTasks: number;

  constructor(readonly initialConfig: z.output<typeof TaskServiceConfigSchema>["agentDefaults"]) {
    this.autoApprove = initialConfig.autoApprove;
    this.parallelTasks = initialConfig.parallel;
  }


  transferStateFromParent(agent: Agent) {
    /* TODO: The todo list is shared with the parent agent by sharing a reference to the same array
     * This is extremely fragile and should be revisited. We set it to readonly to try and prevent
     * the array from being replaced
     */
    (this.tasks as any) = agent.getState(TaskState).tasks;
  }

  reset(what: ResetWhat[]): void {
    if (what.includes('chat')) {
      this.tasks.splice(0, this.tasks.length);
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      tasks: this.tasks,
      autoApprove: this.autoApprove,
      parallelTasks: this.parallelTasks,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    if (data.tasks) {
      this.tasks.splice(0, data.tasks.length, ...data.tasks);
    }

    this.autoApprove = data.autoApprove ?? 0;
    this.parallelTasks = data.parallelTasks ?? 1;
  }

  show(): string[] {
    const statusCounts = this.tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return [
      `Total Tasks: ${this.tasks.length}`,
      ...Object.entries(statusCounts).map(([status, count]) => `  ${status}: ${count}`),
      `Auto-approve: ${this.autoApprove > 0 ? `${this.autoApprove}s` : 'disabled'}`,
      `Parallel tasks: ${this.parallelTasks}`
    ];
  }
}