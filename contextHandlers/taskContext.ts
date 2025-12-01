import {AgentManager} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import {ChatService} from "@tokenring-ai/chat";
import TaskService from "../TaskService.ts";

export default async function * getContextItems(input: string, chatConfig: ChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
  const taskService = agent.requireServiceByType(TaskService);
  const chatService = agent.requireServiceByType(ChatService);
  const enabledTools = chatService.getEnabledTools(agent);
  
  if (enabledTools.includes("@tokenring-ai/tasks/runTasks") &&
    !enabledTools.includes("@tokenring-ai/agent/runAgent")) {
    const agentManager = agent.requireServiceByType(AgentManager);
    const agentTypes = agentManager.getAgentConfigs();

    yield {
      role: "user",
      content: `/* The following agent types can be run with the tasks/run tool */` +
        Object.entries(agentTypes).map(([name, config]) =>
          `- ${name}: ${config.description}`
        ).join("\n")
    };
  }

  const tasks = taskService.getTasks(agent);
  if (tasks.length > 0) {
    const taskSummary = tasks.map(t =>
      `- ${t.name} (${t.status}): ${t.agentType} - ${t.message}`
    ).join('\n');

    yield {
      role: "user",
      content: `/* The user has approved the following task plan */:\n${taskSummary}`
    };
  }
}
