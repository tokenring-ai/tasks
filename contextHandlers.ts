import {ContextHandler} from "@tokenring-ai/chat/types";
import {default as taskContext} from "./contextHandlers/taskContext.ts";

export default {
  'task-context': taskContext,
} as Record<string, ContextHandler>;
