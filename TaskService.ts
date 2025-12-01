import {AgentManager} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {execute as runAgent} from "@tokenring-ai/agent/tools/runAgent";
import {ContextItem} from "@tokenring-ai/agent/types";
import {ChatService} from "@tokenring-ai/chat";
import {TokenRingService} from "@tokenring-ai/app/types";
import {v4 as uuid} from 'uuid';
import {Task, TaskState} from "./state/taskState.ts";

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
        const result = await runAgent({
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


}