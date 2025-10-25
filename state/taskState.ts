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
  tasks: Task[] = [];
  persistToSubAgents = true;

  constructor({tasks = []}: {tasks?: Task[]} = {}) {
    this.tasks = [...tasks];
  }

  reset(what: ResetWhat[]): void {
    if (what.includes('chat')) {
      this.tasks = [];
    }
  }

  serialize(): object {
    return {
      tasks: this.tasks,
    };
  }

  deserialize(data: any): void {
    this.tasks = data.tasks ? [...data.tasks] : [];
  }

  show(): string[] {
    const statusCounts = this.tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return [
      `Total Tasks: ${this.tasks.length}`,
      ...Object.entries(statusCounts).map(([status, count]) => `  ${status}: ${count}`)
    ];
  }
}