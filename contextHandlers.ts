import {ContextHandler} from "@tokenring-ai/chat/types";
import {default as taskPlan} from "./contextHandlers/taskPlan.ts";

export default {
  'task-plan': taskPlan,
} as Record<string, ContextHandler>;
