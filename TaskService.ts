import Agent from "@tokenring-ai/agent/Agent";
import {ContextItem, TokenRingService} from "@tokenring-ai/agent/types";
import {Task, TaskState} from "./state/taskState.ts";
import { v4 as uuid } from 'uuid';

export default class TaskService implements TokenRingService {
  name = "TaskService";
  description = "Provides task management functionality";

  async attach(agent: Agent): Promise<void> {
    agent.initializeState(TaskState, {});
  }

  addTask(task: Omit<Task, 'id' | 'status'>, agent: Agent): string {
    const id = uuid();
    const newTask: Task = {
      ...task,
      id,
      status: 'pending'
    };
    
    agent.mutateState(TaskState, (state: TaskState) => {
      state.tasks.push(newTask);
    });
    
    return id;
  }

  clearTasks(agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      state.tasks = [];
    });
  }

  updateTaskStatus(id: string, status: Task['status'], result: string | undefined, agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.status = status;
        if (result !== undefined) {
          task.result = result;
        }
      }
    });
  }

  getTasks(agent: Agent): Task[] {
    const state = agent.getState(TaskState);
    return [...(state.tasks ?? [])];
  }


  async* getContextItems(agent: Agent): AsyncGenerator<ContextItem> {
    if ( agent.tools.getActiveItemNames().has("@tokenring-ai/tasks/runTasks") &&
       ! agent.tools.getActiveItemNames().has("@tokenring-ai/agent/runAgent")) {
      // TODO: The agent package should be responsible for this, but it doesn't introduce the agent list unless the agent/run tool is active

      // Get the list of available agent types from the agent team
      const agentTypes = agent.team.getAgentConfigs()

      yield {
        position: "afterSystemMessage",
        role: "user",
        content: `/* The following agent types can be run with the tasks/run tool */` +
          Object.entries(agentTypes).map(([name, config]) =>
            `- ${name}: ${config.description}`
          ).join("\n")
      };
    }

    const tasks = this.getTasks(agent);
    if (tasks.length > 0) {
      const taskSummary = tasks.map(t => 
        `- ${t.name} (${t.status}): ${t.agentType} - ${t.message}`
      ).join('\n');
      
      yield {
        position: "afterPriorMessages",
        role: "user",
        content: `/* The user has approved the following task plan */:\n${taskSummary}`
      };
    }
  }
}