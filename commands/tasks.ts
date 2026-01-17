import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import createSubcommandRouter from "@tokenring-ai/agent/util/subcommandRouter";
import clear from "./tasks/clear.js";
import execute from "./tasks/execute.js";
import list from "./tasks/list.js";
import settings from "./tasks/settings.js";

const description = "/tasks - Manage and execute tasks in the task queue";

const executeCmd = createSubcommandRouter({
  list,
  execute,
  clear,
  settings
});

const help: string = `# TASKS COMMAND

## Usage

/tasks [operation]

Manage and execute tasks in the task queue.

## Available Operations

### list
Display all tasks in the current task queue.

**Example:** /tasks list

### clear
Remove all tasks from the current task queue.

**Example:** /tasks clear

### execute
Execute all pending tasks.

**Example:** /tasks execute

### settings
View or modify task settings.

**Examples:**
/tasks settings
/tasks settings auto-approve=30
/tasks settings parallel=3

## Common Use Cases

- View current workload: \`/tasks list\`
- Clean up completed tasks: \`/tasks clear\`
- Process pending work: \`/tasks execute\`
- Configure settings: \`/tasks settings auto-approve=30\`
- Run multiple tasks: \`/tasks settings parallel=5\``;

export default {
  description,
  execute: executeCmd,
  help,
} satisfies TokenRingAgentCommand;