import Agent from "@tokenring-ai/agent/Agent";
import {ContextItem, TokenRingService} from "@tokenring-ai/agent/types";
import {Task, TaskState} from "./state/taskState.ts";
import { v4 as uuid } from 'uuid';
import { runAgent } from "@tokenring-ai/agent/tools";

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

  /**
   * Executes a list of tasks sequentially.
   * @param taskIds - IDs of the tasks to execute (preserves order).
   * @param agent   - Current agent instance.
   * @returns An array of human‑readable execution summaries.
   */
  async executeTasks(taskIds: string[], agent: Agent): Promise<string[]> {
    const results: string[] = [];
    const tasks = this.getTasks(agent);
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    
    for (const taskId of taskIds) {
      const task = taskMap.get(taskId);
      if (!task) {
        results.push(`✗ Task ${taskId}: Not found`);
        continue;
      }
      
      this.updateTaskStatus(task.id, 'running', undefined, agent);
      
      try {
        const result = await runAgent.execute({
          agentType: task.agentType,
          message: task.message,
          context: task.context
        }, agent);
        
        if (result.ok) {
          this.updateTaskStatus(task.id, 'completed', result.response, agent);
          results.push(`✓ ${task.name}: Completed`);
        } else {
          this.updateTaskStatus(task.id, 'failed', result.response || result.error, agent);
          results.push(`✗ ${task.name}: Failed - ${result.response || result.error}`);
        }
      } catch (error) {
        this.updateTaskStatus(task.id, 'failed', String(error), agent);
        results.push(`✗ ${task.name}: Error - ${error}`);
      }
    }
    
    return results;
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