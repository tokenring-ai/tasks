import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import agentCommands from "./commands.ts";
import contextHandlers from "./contextHandlers.ts";
import packageJSON from "./package.json" with { type: "json" };
import tasksRPC from "./rpc/tasks.ts";
import { TaskServiceConfigSchema } from "./schema.ts";
import TaskService from "./TaskService.ts";
import tools from "./tools.ts";

const packageConfigSchema = z.object({
  tasks: TaskServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Task Orchestration",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(tools);
      chatService.registerContextHandlers(contextHandlers);
    });
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    app.addService(new TaskService());

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(tasksRPC);
    });
  },
  reconfigure(app, config) {
    app.requireService(TaskService).reconfigure(config.tasks);
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
