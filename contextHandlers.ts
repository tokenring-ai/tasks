import {ContextHandler} from "@tokenring-ai/chat/types";
import taskPlan from "./contextHandlers/taskPlan.ts";

export default {
  'task-plan': taskPlan,
} as Record<string, ContextHandler>;
