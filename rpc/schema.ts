import {RPCSchema} from "@tokenring-ai/rpc/types";
import {z} from "zod";

export default {
  name: "Tasks RPC",
  path: "/rpc/tasks",
  methods: {
    getEnabledSubAgents: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.object({
        agents: z.array(z.string()),
      }),
    },
    enableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    disableSubAgents: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        agents: z.array(z.string()),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
  }
} satisfies RPCSchema;
