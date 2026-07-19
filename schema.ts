import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
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
        autoApprove: z
          .number()
          .default(0)
          .meta({ description: "Number of sub-tasks to auto-approve before requiring user confirmation" } satisfies ConfigFieldMeta),
        parallel: z
          .number()
          .default(1)
          .meta({ description: "Maximum number of sub-tasks run in parallel" } satisfies ConfigFieldMeta),
        allowedSubAgents: z
          .array(z.string())
          .default([])
          .meta({ description: "Agent types allowed to be spawned as sub-tasks" } satisfies ConfigFieldMeta),
        subAgent: SubAgentConfigSchema.prefault({}),
      })
      .prefault({})
      .meta({ label: "Agent Defaults" } satisfies ConfigFieldMeta),
  })
  .strict()
  .prefault({})
  .meta({ label: "Tasks", description: "Sub-task delegation settings for agents" } satisfies ConfigFieldMeta);
