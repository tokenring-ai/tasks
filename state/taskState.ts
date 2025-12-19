import {Agent} from "@tokenring-ai/agent";
import {ResetWhat} from "@tokenring-ai/agent/AgentEvents";
import type {AgentStateSlice} from "@tokenring-ai/agent/types";

export interface Task {
  id: string;
  name: string;
  agentType: string;
  message: string;
  context: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export class TaskState implements AgentStateSlice {
  name = "TaskState";
  tasks: Task[];
  autoApprove: number;
  parallelTasks: number;

  constructor({tasks = [], autoApprove = 5, parallelTasks = 1}: { tasks?: Task[], autoApprove?: number, parallelTasks?: number } = {}) {
    this.tasks = [...tasks];
    this.autoApprove = autoApprove;
    this.parallelTasks = parallelTasks;
  }

  transferStateFromParent(parent: Agent): void {
    this.deserialize(parent.getState(TaskState).serialize());
  }

  reset(what: ResetWhat[]): void {
    if (what.includes('chat')) {
      this.tasks = [];
    }
  }

  serialize(): object {
    return {
      tasks: this.tasks,
      autoApprove: this.autoApprove,
      parallelTasks: this.parallelTasks,
    };
  }

  deserialize(data: any): void {
    this.tasks = data.tasks ? [...data.tasks] : [];
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