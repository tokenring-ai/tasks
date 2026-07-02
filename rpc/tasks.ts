import { AgentManager } from "@tokenring-ai/agent";
import type { ParsedAgentConfig } from "@tokenring-ai/agent/schema";
import { createAgentStateSliceStream } from "@tokenring-ai/rpc/createAgentStateStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import deepClone from "@tokenring-ai/utility/object/deepClone";
import { TaskAgentConfigSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";
import { TaskState } from "../state/taskState.ts";
import TaskRPCSchema from "./schema.ts";

const streamEnabledSubAgents = createAgentStateSliceStream({
  SliceClass: TaskState,
  project: state => ({
    status: "success" as const,
    agents: state.allowedSubAgents,
  }),
});

function mapAgentTypeEntries(entries: [string, ParsedAgentConfig][]) {
  return entries.map(([type, config]) => {
    const chat = (config as Record<string, unknown>).chat as { enabledTools?: string[] } | undefined;
    const enabledTools = Array.isArray(chat?.enabledTools) ? chat.enabledTools : [];
    return {
      type,
      displayName: config.displayName,
      description: config.description,
      category: config.category,
      enabledTools,
    };
  });
}

export default createRPCEndpoint(TaskRPCSchema, {
  getAvailableSubAgents(args, app) {
    const agentManager = app.requireService(AgentManager);
    const agent = agentManager.getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const taskService = app.requireService(TaskService);
    const config = deepClone(taskService.options.agentDefaults, agent.getAgentConfigSlice("tasks", TaskAgentConfigSchema));
    const entries = agentManager.getAgentTypesLike(config.allowedSubAgents);

    return { status: "success", agents: mapAgentTypeEntries(entries) };
  },

  getEnabledSubAgents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const taskState = agent.getState(TaskState);
    return { status: "success", agents: taskState.allowedSubAgents };
  },

  streamEnabledSubAgents,

  enableSubAgents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    agent.mutateState(TaskState, state => {
      for (const agentType of args.agents) {
        if (!state.allowedSubAgents.includes(agentType)) {
          state.allowedSubAgents.push(agentType);
        }
      }
    });

    return { status: "success", success: true };
  },

  disableSubAgents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    agent.mutateState(TaskState, state => {
      state.allowedSubAgents = state.allowedSubAgents.filter(agentType => !args.agents.includes(agentType));
    });

    return { status: "success", success: true };
  },
});
