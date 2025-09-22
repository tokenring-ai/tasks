import {AgentStateSlice} from "@tokenring-ai/agent/Agent";
import {ResetWhat} from "@tokenring-ai/agent/AgentEvents";

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
}