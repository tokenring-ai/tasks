import {SubAgentService} from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
import type {TokenRingService} from "@tokenring-ai/app/types";
import deepMerge from "@tokenring-ai/utility/object/deepMerge";
import formatLogMessages from "@tokenring-ai/utility/string/formatLogMessage";
import async from "async";
import {v4 as uuid} from "uuid";
import type {z} from "zod";
import {TaskAgentConfigSchema, type TaskServiceConfigSchema} from "./schema.ts";
import {type Task, TaskState} from "./state/taskState.ts";

export default class TaskService implements TokenRingService {
  readonly name = "TaskService";
  description = "Provides task management functionality";

  constructor(readonly options: z.output<typeof TaskServiceConfigSchema>) {
  }

  attach(agent: Agent): void {
    const config = deepMerge(
      this.options.agentDefaults,
      agent.getAgentConfigSlice("tasks", TaskAgentConfigSchema),
    );

    const agentManager = agent.requireServiceByType(AgentManager);

    // Resolve wildcards to actual agent types
    const resolvedAllowedAgents = agentManager
      .getAgentTypesLike(config.allowedSubAgents)
      .map(([type]) => type);

    // Initialize the TaskState with resolved allowed agents
    agent.initializeState(TaskState, {
      ...config,
      allowedSubAgents: resolvedAllowedAgents,
    });
  }

  addTask(task: Omit<Task, "id" | "status">, agent: Agent): string {
    const id = uuid();
    const newTask: Task = {
      ...task,
      id,
      status: "pending",
    };

    agent.mutateState(TaskState, (state: TaskState) => {
      state.tasks.push(newTask);
    });

    return id;
  }

  clearTasks(agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      state.tasks.splice(0, state.tasks.length);
    });
  }

  updateTaskStatus(
    id: string,
    status: Task["status"],
    result: string | undefined,
    agent: Agent,
  ): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      const task = state.tasks.find((t) => t.id === id);
      if (task) {
        task.status = status;
        if (result !== undefined) {
          task.result = result;
        }
      } else {
        throw new Error(`Task ${id} not found`);
      }
    });
  }

  getTasks(agent: Agent): Task[] {
    const state = agent.getState(TaskState);
    return [...state.tasks];
  }

  /**
   * Executes a list of tasks with configurable parallelism.
   * @param taskIds - IDs of the tasks to execute (preserves order).
   * @param parentAgent   - Current parentAgent instance.
   * @returns An array of human-readable execution summaries.
   */
  async executeTasks(taskIds: string[], parentAgent: Agent): Promise<string[]> {
    const state = parentAgent.getState(TaskState);
    const parallelTasks = state.parallelTasks || 1;
    const tasks = this.getTasks(parentAgent);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const allowedSubAgents = state.allowedSubAgents;
    for (const task of tasks) {
      if (!allowedSubAgents.includes(task.agentType)) {
        throw new Error(
          `Sub-agent type "${task.agentType}" is not allowed for this agent.`,
        );
      }
    }

    const executeTask = async (taskId: string): Promise<string> => {
      const task = taskMap.get(taskId);
      if (!task) return `✗ Task ${taskId}: Not found`;

      this.updateTaskStatus(task.id, "running", undefined, parentAgent);
      const subAgentOptions = parentAgent.getState(TaskState).subAgent;

      try {
        const subAgentService =
          parentAgent.requireServiceByType(SubAgentService);

        const result = await subAgentService.runSubAgent({
          agentType: task.agentType,
          headless: parentAgent.headless,
          from: `Task ${task.name}`,
          steps: [`${task.message}\n\nImportant Context:\n${task.context}`],
          parentAgent,
          options: subAgentOptions,
        });

        if (result.status === "success") {
          this.updateTaskStatus(
            task.id,
            "completed",
            result.response,
            parentAgent,
          );
          return `✓ ${task.name}: Completed`;
        } else {
          this.updateTaskStatus(
            task.id,
            "failed",
            result.response,
            parentAgent,
          );
          return `✗ ${task.name}: Failed - ${result.response}`;
        }
      } catch (error) {
        const errorString = formatLogMessages(["Error: ", error as any]);
        this.updateTaskStatus(task.id, "failed", errorString, parentAgent);
        return `✗ ${task.name}: Failed - ${errorString}`;
      }
    };

    // Execute tasks with controlled parallelism using async.mapLimit
    return await async.mapLimit(taskIds, parallelTasks, executeTask);
  }
}
