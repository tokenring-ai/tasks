import {z} from "zod";

export const TaskAgentConfigSchema = z.object({
  autoApprove: z.number().optional(),
  parallel: z.number().optional(),
}).default({})

export const TaskServiceConfigSchema = z.object({
  agentDefaults: z.object({
    autoApprove: z.number().default(0),
    parallel: z.number().default(1),
  }).prefault({})
}).strict().prefault({});

