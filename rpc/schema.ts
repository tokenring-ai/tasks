import { AgentNotFoundSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";

export default {
  name: "Tasks RPC",
  path: "/rpc/tasks",
  methods: {
    getAvailableSubAgents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          agents: z.array(
            z.object({
              type: z.string(),
              displayName: z.string(),
              description: z.string(),
              category: z.string().exactOptional(),
              enabledTools: z.array(z.string()).default([]),
            }),
          ),
        }),
        AgentNotFoundSchema,
      ]),
    },
    getEnabledSubAgents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          agents: z.array(z.string()),
        }),
        AgentNotFoundSchema,
      ]),
    },
    streamEnabledSubAgents: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          agents: z.array(z.string()),
        }),
        AgentNotFoundSchema,
      ]),
    },
    enableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          success: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    disableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          success: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
