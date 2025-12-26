import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService} from "@tokenring-ai/chat";
import {z} from "zod";

import chatCommands from "./chatCommands.ts";
import contextHandlers from "./contextHandlers.ts";
import packageJSON from './package.json' with {type: 'json'};
import TaskService from "./TaskService.js";
import tools from "./tools.ts";

const packageConfigSchema = z.object({});


export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(packageJSON.name, tools);
      chatService.registerContextHandlers(contextHandlers);
    });
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    app.addServices(new TaskService());
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
