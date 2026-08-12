import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import {
  TaskBatchSchema,
  TaskInputSchema,
  TaskListSummarySchema,
  TaskPrioritySchema,
  TaskRunSchema,
  TaskSchema,
  TaskSearchMatchSchema,
  TaskStatusSchema,
  TaskSummarySchema,
} from "../schema.ts";

export default {
  name: "Tasks RPC",
  path: "/rpc/tasks",
  methods: {
    getTaskConfiguration: {
      type: "query",
      input: z.object({}),
      result: z.object({
        directory: z.string(),
        defaultList: z.string(),
        defaultAgentType: z.string(),
        parallel: z.number(),
        statuses: z.array(TaskStatusSchema),
        priorities: z.array(TaskPrioritySchema),
        agentTypes: z.array(
          z.object({
            type: z.string(),
            displayName: z.string(),
            description: z.string(),
            category: z.string().optional(),
          }),
        ),
      }),
    },
    listTaskLists: {
      type: "query",
      input: z.object({}),
      result: z.object({ lists: z.array(TaskListSummarySchema) }),
    },
    streamTaskLists: {
      type: "stream",
      input: z.object({}),
      result: z.object({ lists: z.array(TaskListSummarySchema) }),
    },
    listTasks: {
      type: "query",
      input: z.object({
        list: z.string().exactOptional(),
        status: TaskStatusSchema.exactOptional(),
        tag: z.string().exactOptional(),
      }),
      result: z.object({ tasks: z.array(TaskSummarySchema) }),
    },
    streamTasks: {
      type: "stream",
      input: z.object({ list: z.string().exactOptional() }),
      result: z.object({ tasks: z.array(TaskSummarySchema) }),
    },
    getTask: {
      type: "query",
      input: z.object({ list: z.string(), name: z.string() }),
      result: z.object({ task: TaskSchema.nullable() }),
    },
    searchTasks: {
      type: "query",
      input: z.object({
        query: z.string(),
        list: z.string().exactOptional(),
        status: TaskStatusSchema.exactOptional(),
        limit: z.number().exactOptional(),
      }),
      result: z.object({ matches: z.array(TaskSearchMatchSchema) }),
    },
    createTaskList: {
      type: "mutation",
      input: z.object({ name: z.string() }),
      result: z.object({ list: TaskListSummarySchema }),
    },
    deleteTaskList: {
      type: "mutation",
      input: z.object({ name: z.string() }),
      result: z.object({ success: z.boolean() }),
    },
    createTask: {
      type: "mutation",
      input: z.object({ list: z.string(), name: z.string(), task: TaskInputSchema }),
      result: z.object({ task: TaskSchema }),
    },
    updateTask: {
      type: "mutation",
      input: z.object({
        list: z.string(),
        name: z.string(),
        task: TaskInputSchema,
        /** Passed by editors so a concurrent change is reported instead of silently overwritten. */
        expectedUpdatedAt: z.string().exactOptional(),
      }),
      result: z.object({ task: TaskSchema }),
    },
    setTaskStatus: {
      type: "mutation",
      input: z.object({ list: z.string(), name: z.string(), status: TaskStatusSchema }),
      result: z.object({ task: TaskSchema }),
    },
    moveTask: {
      type: "mutation",
      input: z.object({ fromList: z.string(), fromName: z.string(), toList: z.string(), toName: z.string() }),
      result: z.object({ task: TaskSchema }),
    },
    deleteTask: {
      type: "mutation",
      input: z.object({ list: z.string(), name: z.string() }),
      result: z.object({ success: z.boolean() }),
    },
    getRuns: {
      type: "query",
      input: z.object({ batchId: z.string().exactOptional() }),
      result: z.object({ runs: z.array(TaskRunSchema), batches: z.array(TaskBatchSchema) }),
    },
    streamTaskRuns: {
      type: "stream",
      input: z.object({}),
      result: SuccessSchema.extend({
        runs: z.array(TaskRunSchema),
        batches: z.array(TaskBatchSchema),
      }),
    },
    runTask: {
      type: "mutation",
      input: z.object({ list: z.string(), name: z.string(), headless: z.boolean().default(true) }),
      result: z.object({ runId: z.string(), agentId: z.string().nullable() }),
    },
    runTasks: {
      type: "mutation",
      input: z.object({
        list: z.string(),
        names: z.array(z.string()),
        parallel: z.number().exactOptional(),
        label: z.string().exactOptional(),
        headless: z.boolean().default(true),
      }),
      result: z.object({ batchId: z.string() }),
    },
    cancelRun: {
      type: "mutation",
      input: z.object({ runId: z.string(), reason: z.string().exactOptional() }),
      result: z.object({ success: z.boolean() }),
    },
    cancelBatch: {
      type: "mutation",
      input: z.object({ batchId: z.string(), reason: z.string().exactOptional() }),
      result: z.object({ cancelled: z.number() }),
    },
  },
} satisfies RPCSchema;
