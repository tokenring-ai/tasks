import type {RPCSchema} from "@tokenring-ai/rpc/types";
import {z} from "zod";
import {AgentNotFoundSchema} from "@tokenring-ai/agent/schema";

export default {
  name: "Tasks RPC",
  path: "/rpc/tasks",
  methods: {
    getEnabledSubAgents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          agents: z.array(z.string()),
        }),
        AgentNotFoundSchema
      ]),
    },
    enableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          success: z.boolean(),
        }),
        AgentNotFoundSchema
      ]),
    },
    disableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.discriminatedUnion("status", [
        z.object({
          status: z.literal('success'),
          success: z.boolean(),
        }),
        AgentNotFoundSchema
      ]),
    },
  },
} satisfies RPCSchema;
