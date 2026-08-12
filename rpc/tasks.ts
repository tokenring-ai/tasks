import { AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { TASK_STATUSES, TaskPrioritySchema } from "../schema.ts";
import { TaskState } from "../state/taskState.ts";
import TaskService from "../TaskService.ts";
import TasksRpcSchema from "./schema.ts";

async function projectTaskLists(_args: Record<string, never>, app: TokenRingApp) {
  return { lists: await app.requireService(TaskService).listTaskLists() };
}

async function projectTasks(args: { list?: string | undefined }, app: TokenRingApp) {
  const taskService = app.requireService(TaskService);
  return { tasks: args.list ? await taskService.listTasks(args.list) : await taskService.listAllTasks() };
}

// The filesystem has no state slice to subscribe to, so these poll.
const streamTaskLists = createPollingQueryStream({ intervalMs: 3000, poll: projectTaskLists });
const streamTasks = createPollingQueryStream({ intervalMs: 3000, poll: projectTasks });

export default createRPCEndpoint(TasksRpcSchema, {
  getTaskConfiguration(_args, app: TokenRingApp) {
    const taskService = app.requireService(TaskService);
    const agentManager = app.requireService(AgentManager);

    const allowed = new Set(taskService.getAgentTypes());
    const agentTypes = agentManager
      .getAgentConfigEntries()
      .filter(([type]) => allowed.size === 0 || allowed.has(type))
      .map(([type, config]) => ({
        type,
        displayName: config.displayName || type,
        description: config.description || "",
        ...(config.category ? { category: config.category } : {}),
      }));

    return {
      directory: taskService.getTaskDirectory(),
      defaultList: taskService.getDefaultList(),
      defaultAgentType: taskService.getDefaultAgentType(),
      parallel: taskService.getParallel(),
      statuses: [...TASK_STATUSES],
      priorities: [...TaskPrioritySchema.options],
      agentTypes,
    };
  },

  async listTaskLists(args, app: TokenRingApp) {
    return projectTaskLists(args, app);
  },

  streamTaskLists,

  async listTasks(args, app: TokenRingApp) {
    const taskService = app.requireService(TaskService);
    const filter = stripUndefinedKeys({ status: args.status, tag: args.tag });
    const tasks = args.list ? await taskService.listTasks(args.list, filter) : await taskService.listAllTasks(filter);
    return { tasks };
  },

  streamTasks,

  async getTask(args, app: TokenRingApp) {
    return { task: await app.requireService(TaskService).getTask(args.list, args.name) };
  },

  async searchTasks(args, app: TokenRingApp) {
    const matches = await app
      .requireService(TaskService)
      .searchTasks(args.query, stripUndefinedKeys({ list: args.list, status: args.status, limit: args.limit }));
    return { matches };
  },

  async createTaskList(args, app: TokenRingApp) {
    return { list: await app.requireService(TaskService).createTaskList(args.name) };
  },

  async deleteTaskList(args, app: TokenRingApp) {
    return { success: await app.requireService(TaskService).deleteTaskList(args.name) };
  },

  async createTask(args, app: TokenRingApp) {
    return { task: await app.requireService(TaskService).createTask(args.list, args.name, args.task) };
  },

  async updateTask(args, app: TokenRingApp) {
    const task = await app
      .requireService(TaskService)
      .updateTask(args.list, args.name, args.task, stripUndefinedKeys({ expectedUpdatedAt: args.expectedUpdatedAt }));
    return { task };
  },

  async setTaskStatus(args, app: TokenRingApp) {
    return { task: await app.requireService(TaskService).setTaskStatus(args.list, args.name, args.status) };
  },

  async moveTask(args, app: TokenRingApp) {
    return { task: await app.requireService(TaskService).moveTask(args.fromList, args.fromName, args.toList, args.toName) };
  },

  async deleteTask(args, app: TokenRingApp) {
    return { success: await app.requireService(TaskService).deleteTask(args.list, args.name) };
  },

  getRuns(args, app: TokenRingApp) {
    const taskService = app.requireService(TaskService);
    const runs = taskService.getRuns().filter(run => (args.batchId ? run.batchId === args.batchId : true));
    return { runs: runs.map(run => ({ ...run })), batches: taskService.getBatches().map(batch => ({ ...batch })) };
  },

  async *streamTaskRuns(_args, app: TokenRingApp, signal) {
    for await (const state of app.subscribeStateAsync(TaskState, signal)) {
      yield {
        status: "success" as const,
        runs: state.runs.map(run => ({ ...run })),
        batches: state.batches.map(batch => ({ ...batch })),
      };
    }
  },

  async runTask(args, app: TokenRingApp) {
    // Headless runs reap their agent; an interactive run leaves it around to open.
    return app.requireService(TaskService).spawnTask({ list: args.list, name: args.name }, { headless: args.headless, cleanupAgent: args.headless });
  },

  runTasks(args, app: TokenRingApp) {
    const refs = args.names.map(name => ({ list: args.list, name }));
    const batchId = app
      .requireService(TaskService)
      .spawnTasks(refs, stripUndefinedKeys({ headless: args.headless, parallel: args.parallel, label: args.label ?? `${args.list} (${refs.length} tasks)` }));
    return { batchId };
  },

  cancelRun(args, app: TokenRingApp) {
    return { success: app.requireService(TaskService).cancelRun(args.runId, args.reason) };
  },

  cancelBatch(args, app: TokenRingApp) {
    return { cancelled: app.requireService(TaskService).cancelBatch(args.batchId, args.reason) };
  },
});
