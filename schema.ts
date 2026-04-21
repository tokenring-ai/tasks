import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import { z } from "zod";

export const TaskAgentConfigSchema = z
  .object({
    autoApprove: z.number().exactOptional(),
    parallel: z.number().exactOptional(),
    allowedSubAgents: z.array(z.string()).exactOptional(),
    subAgent: SubAgentConfigSchema.exactOptional(),
  })
  .default({});

export const TaskServiceConfigSchema = z
  .object({
    agentDefaults: z
      .object({
        autoApprove: z.number().default(0),
        parallel: z.number().default(1),
        allowedSubAgents: z.array(z.string()).default([]),
        subAgent: SubAgentConfigSchema.prefault({}),
      })
      .prefault({}),
  })
  .strict()
  .prefault({});
