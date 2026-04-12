# @tokenring-ai/tasks

A comprehensive task management service for the TokenRing AI ecosystem that enables agents to create, manage, and execute task plans with user approval workflows, parallel processing, and complete lifecycle tracking.

## Overview

The `@tokenring-ai/tasks` package provides a complete task planning and execution framework for AI agents within the TokenRing system. It allows agents to create detailed task plans, present them to users for approval, and automatically execute approved tasks by dispatching them to specialized agents with configurable parallel processing.

### Key Features

- **Task Planning**: Create comprehensive task plans with multiple tasks and detailed context
- **User Approval Workflow**: Interactive task plan approval system with configurable timeout
- **Parallel Execution**: Execute tasks in parallel with configurable concurrency limits
- **Task Status Tracking**: Monitor complete task lifecycle (pending, running, completed, failed)
- **Auto-Approve**: Configurable automatic approval for streamlined workflows
- **Manual Management**: Chat commands for task inspection, control, and configuration
- **Context Integration**: Seamless integration with agent context systems
- **State Persistence**: Persistent task state across agent instances

## Installation

This package is part of the TokenRing AI ecosystem. Install it as a dependency:

```bash
bun add @tokenring-ai/tasks
```

For local development in the TokenRing monorepo, the package is available as a workspace dependency.

## Package Structure

```
pkg/tasks/
├── index.ts                    # Package exports (TaskService, Task type)
├── TaskService.ts              # Main task management service
├── schema.ts                   # Configuration schemas
├── plugin.ts                   # Plugin configuration and installation
├── tools.ts                    # Tool exports
├── tools/
│   └── runTasks.ts             # Task planning and execution tool
├── commands.ts                 # Command exports
├── commands/
│   └── tasks/
│       ├── list.ts             # List all tasks command
│       ├── execute.ts          # Execute pending tasks command
│       ├── clear.ts            # Clear all tasks command
│       └── settings.ts         # View/modify task settings command
├── state/
│   └── taskState.ts            # Task data structures and state management
├── contextHandlers.ts          # Context handler exports
├── contextHandlers/
│   └── taskPlan.ts             # Task plan context handler
├── package.json                # Package metadata and dependencies
├── README.md                   # This documentation
├── vitest.config.ts            # Test configuration
├── runTasks.test.ts            # Tool tests
└── tasksCommand.test.ts        # Command tests
```

## Services

### TaskService

The TaskService is the core service that manages the complete task lifecycle within the TokenRing ecosystem.

```typescript
class TaskService implements TokenRingService {
  readonly name = "TaskService";
  description = "Provides task management functionality";

  constructor(readonly options: z.output<typeof TaskServiceConfigSchema>) {}

  attach(agent: Agent): void {
    // Initializes state with merged configuration
    const config = deepMerge(this.options.agentDefaults, agent.getAgentConfigSlice('tasks', TaskAgentConfigSchema));
    agent.initializeState(TaskState, config);
  }

  addTask(task: Omit<Task, 'id' | 'status'>, agent: Agent): string;
  getTasks(agent: Agent): Task[];
  updateTaskStatus(id: string, status: Task['status'], result: string | undefined, agent: Agent): void;
  clearTasks(agent: Agent): void;
  executeTasks(taskIds: string[], parentAgent: Agent): Promise<string[]>;
}
```

### Task Interface

Each task contains comprehensive information for execution:

```typescript
interface Task {
  id: string;                    // Unique identifier (UUID)
  name: string;                  // Descriptive task name
  agentType: string;             // Type of agent to handle the task
  message: string;               // Main task description (1 paragraph)
  context: string;               // Detailed execution instructions (3+ paragraphs)
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;               // Execution result if completed
}
```

### TaskState

State management for persistence and serialization:

```typescript
class TaskState extends AgentStateSlice {
  readonly name = "TaskState";
  readonly tasks: Task[] = [];
  autoApprove: number;           // Auto-approve timeout in seconds
  parallelTasks: number;         // Maximum parallel task execution

  constructor(readonly initialConfig: z.output<typeof TaskServiceConfigSchema>["agentDefaults"]) {
    this.autoApprove = initialConfig.autoApprove;
    this.parallelTasks = initialConfig.parallel;
  }

  transferStateFromParent(agent: Agent): void;
  reset(): void;
  serialize(): z.output<typeof serializationSchema>;
  deserialize(data: z.output<typeof serializationSchema>): void;
  show(): string[];
}
```

**Serialization Schema:**

```typescript
const serializationSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    agentType: z.string(),
    message: z.string(),
    context: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    result: z.string().optional()
  })),
  autoApprove: z.number(),
  parallelTasks: z.number()
});
```

## Configuration

### Plugin Configuration

The plugin can be configured with default settings for all agents:

```typescript
{
  tasks: {
    agentDefaults: {
      autoApprove: 0,      // Auto-approve timeout in seconds (0 = disabled)
      parallel: 1          // Maximum parallel tasks (minimum: 1)
    }
  }
}
```

### Configuration Schema

```typescript
export const TaskAgentConfigSchema = z.object({
  autoApprove: z.number().optional(),
  parallel: z.number().optional(),
}).default({})

export const TaskServiceConfigSchema = z.object({
  agentDefaults: z.object({
    autoApprove: z.number().default(0),
    parallel: z.number().default(1),
  }).prefault({})
}).strict().prefault({});
```

### Auto-Approve

- **Purpose**: Automatically approve task plans after a timeout
- **Range**: 0 (disabled) to any positive integer (seconds)
- **Default**: 0 (disabled)
- **Usage**: Set via `/tasks settings auto-approve=<seconds>` or `agent.getState(TaskState).autoApprove`

### Parallel Tasks

- **Purpose**: Control concurrent task execution
- **Range**: 1 to any positive integer
- **Default**: 1 (sequential execution)
- **Usage**: Set via `/tasks settings parallel=<count>` or `agent.getState(TaskState).parallelTasks`

### Task Context

- **Message**: One paragraph describing the task objective
- **Context**: Three+ paragraphs with detailed execution instructions
- **Requirement**: Must include file paths, technical specifications, and step-by-step instructions

## Usage Examples

### 1. Using the Task Planning Tool

The primary way to create and execute task plans with user approval:

```typescript
// Create a comprehensive task plan
await agent.executeTool('tasks_run', {
  tasks: [
    {
      taskName: "Create user authentication system",
      agentType: "backend-developer",
      message: "Implement JWT-based authentication with login/logout endpoints",
      context: "Create auth middleware, user model, login/logout routes in Express.js. Use bcrypt for password hashing. Include proper error handling and validation. Set up appropriate HTTP status codes and response formats. Handle edge cases like expired tokens and concurrent requests."
    },
    {
      taskName: "Design login UI components",
      agentType: "frontend-developer",
      message: "Create responsive login and registration forms",
      context: "Build React components with form validation, error handling, and responsive design using Tailwind CSS. Include loading states, proper accessibility attributes, and consistent styling with the application's design system. Implement proper error messaging and success states."
    },
    {
      taskName: "Write authentication tests",
      agentType: "test-engineer",
      message: "Create comprehensive test suite for auth system",
      context: "Write unit tests for auth middleware, integration tests for login/logout endpoints, and E2E tests for UI flows. Include edge cases like invalid credentials, expired tokens, and concurrent access scenarios. Ensure proper test coverage and maintainable test structure. Mock external dependencies appropriately."
    }
  ]
});
```

### 2. Programmatic Task Management

```typescript
import TaskService from '@tokenring-ai/tasks';

const taskService = agent.requireServiceByType(TaskService);

// Add individual tasks
const taskId = taskService.addTask({
  name: "Process user data",
  agentType: "data-processor",
  message: "Clean and validate user input data",
  context: "Parse CSV files, remove duplicates, validate email formats, and standardize data formats. Handle missing values appropriately and generate summary reports. Implement proper error handling for malformed data."
}, agent);

// Get all tasks
const allTasks = taskService.getTasks(agent);

// Update task status
taskService.updateTaskStatus(taskId, 'completed', 'Data processed successfully', agent);

// Execute specific tasks
const results = await taskService.executeTasks([taskId], agent);
```

### 3. Configuration Management

```typescript
// Configure auto-approve timeout (seconds)
agent.mutateState(TaskState, state => {
  state.autoApprove = 30;
});

// Configure parallel task execution
agent.mutateState(TaskState, state => {
  state.parallelTasks = 3;
});

// Get current configuration
const autoApproveTimeout = agent.getState(TaskState).autoApprove;
const parallelLimit = agent.getState(TaskState).parallelTasks;
```

## Task Planning Workflow

1. **Planning Phase**: Create comprehensive task plans with detailed context
2. **Approval Phase**: Task plan presented to user with clear descriptions and agent assignments
3. **Auto-Approve Check**: If configured, automatically approve after timeout
4. **Execution Phase**: Upon approval, tasks are added and executed with parallel processing
5. **Tracking Phase**: Task status updated in real-time as agents complete work
6. **Results Phase**: Execution results collected and reported back

## Tool Reference

### tasks_run

Create and present a complete task plan to the user for approval. If approved, execute all tasks immediately with parallel processing.

**Tool Name**: `tasks_run`

**Display Name**: `Tasks/runTasks`

**Description**: "Create and present a complete task plan to the user for approval (unless auto-approve is enabled). If approved, this will execute all tasks immediately and return results. If not approved, this will return a reason for rejection."

**Required Context Handlers**: `["available-agents"]`

**Input Schema**:

```typescript
const inputSchema = z.object({
  tasks: z.array(z.object({
    taskName: z.string().describe("A descriptive name for the task"),
    agentType: z.string().describe("The type of agent that should handle this task"),
    message: z.string().describe("A one paragraph message/description of what needs to be done, to send to the agent."),
    context: z.string().describe("Three paragraphs of important contextual information to pass to the agent, such as file names, step by step instructions, descriptions, etc. of the exact steps the agent should take. This information is critical to proper agent functionality, and should be detailed and comprehensive. It needs to explain absolutely every aspect of how to complete the task to the agent that will be dispatched")
  })).describe("Array of tasks to add to the task list"),
});
```

**Behavior**:

- Presents task plan to user for approval
- Respects auto-approve configuration if set
- If approved: adds tasks and executes them with parallel processing
- If rejected: prompts for rejection reason and returns it

**Example Execution Flow**:

```typescript
// Tool receives request
const result = await agent.executeTool('tasks_run', {
  tasks: [
    {
      taskName: "Create API endpoint",
      agentType: "backend-developer",
      message: "Create REST API endpoint for user data",
      context: "..."
    }
  ]
});

// Output:
// "The following task plan has been generated:"
// "- Create API endpoint"
// "Task Plan:\n\n1. Create API endpoint (backend-developer)\n   Create REST API endpoint for user data\n\nApprove this task plan for execution?"
// [User approves or auto-approve triggers]
// "Task plan executed:\n✓ Create API endpoint: Completed"
```

## Command Reference

### /tasks

Manage task list with comprehensive subcommands:

**Description**: `/tasks - Manage and executed tasks in the task queue.`

#### list

Display all tasks in the current task queue with their status, agent type, and message content.

**Command**: `tasks list`

**Example**:

```
/tasks list
```

**Output**:

```
Current tasks:
[0] Process Data (pending)
  Agent: data-processor
  Message: Process the uploaded CSV file
[1] Send Email (completed)
  Agent: email-sender
  Message: Send confirmation email to user@example.com
  Result: Email sent successfully...
```

#### execute

Execute all pending tasks by dispatching them to their respective agents. Only tasks with 'pending' status will be executed.

**Command**: `tasks execute`

**Example**:

```
/tasks execute
```

**Output**:

```
Task execution completed:
✓ Process Data: Completed
✗ Send Email: Failed - SMTP connection failed
```

#### clear

Remove all tasks from the current task queue. This action cannot be undone.

**Command**: `tasks clear`

**Example**:

```
/tasks clear
```

**Output**: `Cleared all tasks`

#### settings

View or modify task settings. Settings are stored in the agent state and apply to the current agent.

**Command**: `tasks settings [key=value...]`

**Examples**:

```
/tasks settings
/tasks settings auto-approve=30
/tasks settings parallel=3
/tasks settings auto-approve=30 parallel=5
```

**Output** (no arguments):

```
Task Settings:
 Auto-approve: 30s
 Parallel tasks: 3

Usage:
 /tasks settings auto-approve=<seconds> parallel=<number>
```

**Output** (with settings):

```
Auto-approve enabled with 30s timeout
Parallel tasks set to 5
```

## API Reference

### Service Methods

#### `addTask(task, agent)`

Add a single task to the task list.

**Parameters**:

- `task`: `Omit<Task, 'id' | 'status'>` - Task data without ID and status
- `agent`: `Agent` - Current agent instance

**Returns**: `string` - The generated task ID (UUID)

**Example**:

```typescript
const taskId = taskService.addTask({
  name: "Create user account",
  agentType: "backend-developer",
  message: "Implement user registration functionality",
  context: "Create user model, registration endpoint, validation, and error handling. Use bcrypt for password hashing and JWT for session management."
}, agent);
```

#### `getTasks(agent)`

Retrieve all tasks with their current status.

**Parameters**:

- `agent`: `Agent` - Current agent instance

**Returns**: `Task[]` - Array of all tasks (copy)

**Example**:

```typescript
const tasks = taskService.getTasks(agent);
console.log(`Found ${tasks.length} tasks`);
```

#### `updateTaskStatus(id, status, result?, agent)`

Update the status and optionally the result of a task.

**Parameters**:

- `id`: `string` - Task ID
- `status`: `Task['status']` - New status ('pending', 'running', 'completed', 'failed')
- `result`: `string | undefined` - Execution result (optional)
- `agent`: `Agent` - Current agent instance

**Throws**: `Error` if task not found

**Example**:

```typescript
taskService.updateTaskStatus(taskId, 'completed', 'User account created successfully', agent);
```

#### `clearTasks(agent)`

Remove all tasks from the task list.

**Parameters**:

- `agent`: `Agent` - Current agent instance

**Example**:

```typescript
taskService.clearTasks(agent);
```

#### `executeTasks(taskIds, parentAgent)`

Execute a list of tasks with configured parallelism.

**Parameters**:

- `taskIds`: `string[]` - IDs of tasks to execute (preserves order)
- `parentAgent`: `Agent` - Current parent agent instance

**Returns**: `Promise<string[]>` - Array of execution summaries

**Example**:

```typescript
const results = await taskService.executeTasks([taskId1, taskId2], agent);
console.log(results);
// ['✓ Create API endpoint: Completed', '✗ Send Email: Failed - SMTP connection failed']
```

**Implementation Details**:

- Uses `async.mapLimit` for controlled parallelism
- Updates task status to 'running' before execution
- Updates task status to 'completed' or 'failed' after execution
- Captures and stores error messages for failed tasks

### TaskState Methods

#### `transferStateFromParent(agent)`

Transfer task state from a parent agent instance.

**Parameters**:

- `agent`: `Agent` - Parent agent instance

**Note**: The tasks array is shared with the parent agent (by reference). This is a temporary implementation and should be revisited for better state isolation.

**Example**:

```typescript
taskState.transferStateFromParent(parentAgent);
```

#### `reset()`

Reset task state by clearing all tasks.

**Behavior**:

- Clears all tasks from the tasks array using `splice(0, this.tasks.length)`

**Example**:

```typescript
taskState.reset(); // Clears all tasks
```

#### `serialize()`

Serialize task state for persistence.

**Returns**: `z.output<typeof serializationSchema>` - Serialized state object

**Example**:

```typescript
const serialized = taskState.serialize();
// { tasks: [...], autoApprove: 30, parallelTasks: 3 }
```

#### `deserialize(data)`

Deserialize task state from persisted data.

**Parameters**:

- `data`: `z.output<typeof serializationSchema>` - Serialized state data

**Behavior**:

- Replaces tasks array using splice
- Sets `autoApprove` and `parallelTasks` with fallback defaults

**Example**:

```typescript
taskState.deserialize({ tasks: [], autoApprove: 0, parallelTasks: 1 });
```

#### `show()`

Get human-readable state summary.

**Returns**: `string[]` - Array of state information lines

**Example**:

```typescript
const output = taskState.show();
// Output: [
//   'Total Tasks: 5',
//   '  pending: 2',
//   '  running: 1',
//   '  completed: 1',
//   '  failed: 1',
//   'Auto-approve: 30s',
//   'Parallel tasks: 3'
// ]
```

### Configuration Management

Configuration is managed directly through agent state:

#### Setting Auto-Approve

```typescript
agent.mutateState(TaskState, state => {
  state.autoApprove = 45; // Enable auto-approve after 45 seconds
  // state.autoApprove = 0; // Disable auto-approve
});
```

#### Setting Parallel Tasks

```typescript
agent.mutateState(TaskState, state => {
  state.parallelTasks = 3; // Allow 3 parallel tasks
});
```

#### Getting Configuration

```typescript
const autoApproveTimeout = agent.getState(TaskState).autoApprove;
const parallelLimit = agent.getState(TaskState).parallelTasks;
```

### Context Handlers

#### task-plan

Provides current task summaries to agents as context.

**Handler Name**: `task-plan`

**Usage**: Automatically integrated when plugin is installed

**Example Output**:

```typescript
/* The user has approved the following task plan */:
- Create user authentication (pending): backend-developer - Implement JWT-based authentication
- Design login UI (pending): frontend-developer - Create responsive login forms
- Write tests (completed): test-engineer - Create comprehensive test suite
```

**Implementation**:

```typescript
export default async function* getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem> {
  const taskService = agent.requireServiceByType(TaskService);
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
```

## Integration

The package integrates seamlessly with the TokenRing ecosystem:

### Plugin System

```typescript
export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    // Register tools with ChatService
    app.waitForService(ChatService, chatService => {
      chatService.addTools(tools);
      chatService.registerContextHandlers(contextHandlers);
    });

    // Register commands with AgentCommandService
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(agentCommands)
    );

    // Register the TaskService
    app.addServices(new TaskService(config.tasks));
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

### Service Dependencies

- **ChatService**: Required for tool registration and context handlers
- **AgentCommandService**: Required for command registration
- **TaskService**: Automatically registered and available via `agent.requireServiceByType(TaskService)`

### Tool Integration

- **Tool Discovery**: Tools automatically available to agents via ChatService
- **Schema Validation**: Zod-based input validation for all tool parameters
- **Error Handling**: Comprehensive error handling and user feedback
- **Context Handlers**: Requires `available-agents` context handler for agent type information

### Command Integration

- **Slash Commands**: All commands use `/tasks` prefix
- **Parameter Parsing**: Robust parameter parsing and validation
- **Help Integration**: Built-in help system with detailed documentation
- **Command Structure**:
  - `tasks list` - List all tasks
  - `tasks execute` - Execute pending tasks
  - `tasks clear` - Clear all tasks
  - `tasks settings [key=value...]` - View/modify settings

### State Management

- **State Slice**: `TaskState` extends `AgentStateSlice`
- **Serialization**: Full serialization support with Zod schema
- **Persistence**: State persists across agent instances
- **State Transfer**: Supports parent-to-child state transfer

## Best Practices

### Task Planning

- **Comprehensive Context**: Provide detailed context with step-by-step instructions
- **Clear Agent Assignment**: Use appropriate agent types for each task
- **Dependency Management**: Order tasks to handle dependencies properly
- **Context Detail**: Include file paths, technical requirements, and edge cases
- **Message Brevity**: Keep the message field to one paragraph
- **Context Depth**: Provide 3+ paragraphs in the context field

### Configuration

- **Auto-Approve**: Use for routine or well-tested task plans
- **Parallel Execution**: Use for independent tasks to improve efficiency
- **Timeout Management**: Set reasonable timeouts based on task complexity
- **Parallel Limits**: Consider agent availability when setting parallel limits

### Error Handling

- **Retry Logic**: Use `/tasks execute` to retry failed tasks
- **Error Context**: Provide detailed error context in task results
- **Graceful Degradation**: Handle partial task execution failures

### Performance

- **Parallel Limits**: Don't exceed reasonable parallel task limits
- **Memory Management**: Clear completed tasks periodically with `/tasks clear`
- **State Persistence**: Be mindful of state size with many tasks

## Common Use Cases

### Development Workflows

```typescript
// Feature development
await agent.executeTool('tasks_run', {
  tasks: [
    {
      taskName: "Backend API",
      agentType: "backend-developer",
      message: "Create REST API endpoints",
      context: "Create Express.js REST API with user authentication, CRUD operations for resources, proper error handling, and validation. Include Swagger documentation and unit tests."
    },
    {
      taskName: "Frontend Components",
      agentType: "frontend-developer",
      message: "Build UI components",
      context: "Create React components with TypeScript, using Tailwind CSS for styling. Include form validation, error handling, and responsive design. Connect to backend API endpoints."
    },
    {
      taskName: "Integration Tests",
      agentType: "test-engineer",
      message: "Create integration tests",
      context: "Write integration tests using vitest and React Testing Library. Test API endpoints, component interactions, and user flows. Include edge cases and error scenarios."
    }
  ]
});
```

### Data Processing

```typescript
// Batch data processing
const taskService = agent.requireServiceByType(TaskService);
const taskIds = [];

for (const file of dataFiles) {
  const taskId = taskService.addTask({
    name: `Process ${file}`,
    agentType: "data-processor",
    message: `Process ${file} and extract insights`,
    context: `Load ${file}, apply transformation rules, validate data quality, and generate summary report. Handle missing values and outliers appropriately.`
  }, agent);
  taskIds.push(taskId);
}

const results = await taskService.executeTasks(taskIds, agent);
```

### Content Creation

```typescript
// Content production pipeline
await agent.executeTool('tasks_run', {
  tasks: [
    {
      taskName: "Research",
      agentType: "researcher",
      message: "Gather information on topic",
      context: "Research the latest trends in AI-powered development tools. Include statistics, expert opinions, and real-world use cases. Cite sources properly."
    },
    {
      taskName: "Writing",
      agentType: "writer",
      message: "Create draft content",
      context: "Write a comprehensive article based on research findings. Include introduction, main sections, and conclusion. Use clear, engaging language suitable for technical audience."
    },
    {
      taskName: "Review",
      agentType: "editor",
      message: "Review and edit content",
      context: "Review the draft for clarity, accuracy, and consistency. Check for grammar errors, factual accuracy, and proper structure. Suggest improvements and edits."
    }
  ]
});
```

## Error Handling

### Task Execution Errors

- **Network Issues**: Tasks fail gracefully with error messages
- **Agent Unavailable**: Proper error handling for missing agent types
- **Timeout**: Configurable timeouts for task execution
- **Partial Failures**: Individual task failures don't stop other tasks

### Error Messages

Failed tasks include detailed error information:

```
✗ Task Name: Failed - Error message details
```

### Recovery Strategies

- **Retry Failed Tasks**: Use `/tasks execute` to retry failed tasks
- **Clear and Restart**: Use `/tasks clear` to reset and start fresh
- **Status Inspection**: Use `/tasks list` to identify specific failures

## Testing

The package uses vitest for unit testing. Run tests with:

```bash
bun test
```

Or with watch mode:

```bash
bun run test:watch
```

### Test Files

- `runTasks.test.ts` - Tests for the runTasks tool
- `tasksCommand.test.ts` - Tests for task commands

### Test Commands

```bash
# Run all tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run tests in watch mode
bun run test:watch

# Run tests with UI
bun run test:ui
```

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app` (0.2.0) - Base application framework
- `@tokenring-ai/chat` (0.2.0) - Chat service and tool definitions
- `@tokenring-ai/agent` (0.2.0) - Agent orchestration and sub-agent execution
- `@tokenring-ai/utility` (0.2.0) - Shared utilities and helpers
- `zod` (^4.3.6) - Schema validation
- `uuid` (^13.0.0) - Unique ID generation
- `async` (^3.2.6) - Parallel task execution

### Development Dependencies

- `vitest` (^4.1.0) - Testing framework
- `typescript` (^5.9.3) - TypeScript compiler
- `@types/async` (^3.2.25) - Async library type definitions

## Development

### Build

```bash
bun run build
```

Type-checks the package without emitting output.

### Test

```bash
bun run test
```

### Test Coverage

```bash
bun run test:coverage
```

### Test UI

```bash
bun run test:ui
```

### Test Watch Mode

```bash
bun run test:watch
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
