import Agent from "@tokenring-ai/agent/Agent";
import AgentManager from "@tokenring-ai/agent/services/AgentManager";
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

  getAutoApprove(agent: Agent): boolean {
    const state = agent.getState(TaskState);
    return state.autoApprove ?? false;
  }

  setAutoApprove(autoApprove: boolean, agent: Agent): void {
    agent.mutateState(TaskState, (state: TaskState) => {
      state.autoApprove = autoApprove;
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
   * @param agent   - Current agent instance.
   * @returns An array of human‑readable execution summaries.
   */
  async executeTasks(taskIds: string[], agent: Agent): Promise<string[]> {
    const agentManager = agent.requireServiceByType(AgentManager);
    const state = agent.getState(TaskState);
    const parallelTasks = state.parallelTasks || 1;
    const tasks = this.getTasks(agent);
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const executeTask = async (taskId: string): Promise<string> => {
      const task = taskMap.get(taskId);
      if (!task) return `✗ Task ${taskId}: Not found`;

      this.updateTaskStatus(task.id, 'running', undefined, agent);

      let newAgent: Agent | undefined;
      try {
        let {agentType, message, context} = task;
        // Create a new agent of the specified type
        newAgent = await agentManager.spawnSubAgent(agent, agentType);

        let response = "";

        agent.setBusy("Waiting for agent response...");

        let inputSent = false;

        // Promise to collect the response
        for await (const event of newAgent.events(agent.getAbortSignal())) {
          switch (event.type) {
            case "output.chat":
              response += event.data.content;
              break;
            case "output.system":
              agent.systemMessage(event.data.message, event.data.level);
              // Include system messages in the response for debugging
              if (event.data.level === "error") {
                response += `[System Error: ${event.data.message}]\n`;
              }
              break;
            case "state.idle":
              if (!inputSent) {
                inputSent = true;

                if (context) {
                  message = `${message}\n\nImportant Context:\n${context}`;
                }
                //agent.infoLine("Sending message to agent:", message);
                newAgent.handleInput({message: `/work ${message}`});
              } else if (response) {
                this.updateTaskStatus(task.id, 'completed', trimMiddle(response, 300, 500), agent);
                return `✓ ${task.name}: Completed`;
              } else {
                throw new Error("No response received from agent");
              }
              break;
            case "state.aborted":
              throw new Error("Agent was terminated by user");
            case "human.request":
              // Forward human requests to the parent agent
              const humanResponse = await agent.askHuman(event.data.request);
              newAgent.sendHumanResponse(event.data.sequence, humanResponse);
              break;
          }
        }

        throw new Error("Agent ended prematurely");
      } catch (error) {
        const errorString = formatLogMessages(["Error: ", error as any]);
        this.updateTaskStatus(task.id, 'failed', errorString, agent);
        return `✗ ${task.name}: Failed - ${errorString}`;
      } finally {
        // Clean up the agent
        if (newAgent) await agentManager.deleteAgent(newAgent);
      }
    };

    // Execute tasks with controlled parallelism using async.mapLimit
    return await async.mapLimit(taskIds, parallelTasks, executeTask);
  }


}