import {TokenRingPackage} from "@tokenring-ai/agent";

import * as chatCommands from "./chatCommands.ts";
import packageJSON from './package.json' with {type: 'json'};
import * as tools from "./tools.ts";

export const packageInfo: TokenRingPackage = {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  chatCommands,
  tools
};

export {default as TaskService} from "./TaskService.ts";
export type {Task} from "./state/taskState.ts";