import createSubcommandRouter from "@tokenring-ai/agent/util/subcommandRouter";
import defaultCmd from "./settings/default.js";

export default createSubcommandRouter({
  default: defaultCmd
});
