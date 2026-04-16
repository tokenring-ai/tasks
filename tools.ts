import type {TokenRingToolDefinition} from "@tokenring-ai/chat";
import runTasks from "./tools/runTasks.ts";

export default [ runTasks ] satisfies TokenRingToolDefinition<any>[]