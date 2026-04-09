import {SubAgentConfigSchema} from "@tokenring-ai/agent/schema";
import {z} from "zod";

export const TaskAgentConfigSchema = z.object({
  autoApprove: z.number().optional(),
  parallel: z.number().optional(),
  allowedSubAgents: z.array(z.string()).optional(),
  subAgent: SubAgentConfigSchema.optional(),
}).default({})

export const TaskServiceConfigSchema = z.object({
  agentDefaults: z.object({
    autoApprove: z.number().default(0),
    parallel: z.number().default(1),
    allowedSubAgents: z.array(z.string()).default([]),
    subAgent: SubAgentConfigSchema.prefault({}),
  }).prefault({})
}).strict().prefault({});

