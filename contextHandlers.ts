import {ContextHandler} from "@tokenring-ai/chat/schema";
import taskPlan from "./contextHandlers/taskPlan.ts";

export default {
  'task-plan': taskPlan,
} as Record<string, ContextHandler>;
