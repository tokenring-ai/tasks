import { AgentManager } from "@tokenring-ai/agent";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { TaskState } from "../state/taskState.ts";
import TaskRPCSchema from "./schema.ts";

export default createRPCEndpoint(TaskRPCSchema, {
  getEnabledSubAgents(args, app) {
    const agent = app.requireService(AgentManager).getAgent(args.agentId);
    if (!agent) {
      return { status: "agentNotFound" };
    }

    const taskState = agent.getState(TaskState);
    return { status: "success", agents: taskState.allowedSubAgents };
  },

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
