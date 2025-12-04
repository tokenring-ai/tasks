import Agent from "@tokenring-ai/agent/Agent";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import {AgentEventState} from "@tokenring-ai/agent/state/agentEventState";
import {TokenRingService} from "@tokenring-ai/app/types";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import trimMiddle from "@tokenring-ai/utility/string/trimMiddle";
import async from "async";
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

  getAutoApprove(agent: Agent): number {
    const state = agent.getState(TaskState);
    return state.autoApprove ?? 0;
  }

  setAutoApprove(seconds: number, agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      state.autoApprove = Math.max(0, seconds);
    });
  }

  setParallelTasks(parallelTasks: number, agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      state.parallelTasks = Math.max(1, parallelTasks);
    });
  }
  /**
   * Executes a list of tasks with configurable parallelism.
   * @param taskIds - IDs of the tasks to execute (preserves order).
   * @param parentAgent   - Current parentAgent instance.
   * @returns An array of human-readable execution summaries.
   */
  async executeTasks(
    taskIds: string[],
    parentAgent: Agent,
  ): Promise<string[]> {
    const state = parentAgent.getState(TaskState);
    const parallelTasks = state.parallelTasks || 1;
    const tasks = this.getTasks(parentAgent);
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const executeTask = async (taskId: string): Promise<string> => {
      const task = taskMap.get(taskId);
      if (!task) return `✗ Task ${taskId}: Not found`;

      this.updateTaskStatus(task.id, 'running', undefined, parentAgent);

      try {
        const result = await runSubAgent(
          {
            agentType: task.agentType,
            headless: parentAgent.headless,
            message: task.message,
            context: task.context,
            forwardChatOutput: true,
            forwardSystemOutput: true,
            forwardHumanRequests: true, // Always forward human requests
            timeout: parentAgent.config.maxRunTime > 0 ? parentAgent.config.maxRunTime : undefined,
            maxResponseLength: 500,
            minContextLength: 300,
          },
          parentAgent
        );

        if (result.status === 'success' || result.status === 'error') {
          this.updateTaskStatus(task.id, 'completed', result.response, parentAgent);
          return `✓ ${task.name}: Completed`;
        } else {
          this.updateTaskStatus(task.id, 'failed', result.response, parentAgent);
          return `✗ ${task.name}: Failed - ${result.response}`;
        }
      } catch (error) {
        const errorString = formatLogMessages(["Error: ", error as any]);
        this.updateTaskStatus(task.id, 'failed', errorString, parentAgent);
        return `✗ ${task.name}: Failed - ${errorString}`;
      }
    };

    // Execute tasks with controlled parallelism using async.mapLimit
    return await async.mapLimit(taskIds, parallelTasks, executeTask);
  }
}