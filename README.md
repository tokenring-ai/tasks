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
bun install @tokenring-ai/tasks
```

## Package Structure

```
pkg/tasks/
├── index.ts                    # Package exports and plugin registration
├── TaskService.ts              # Main task management service
├── state/
│   └── taskState.ts            # Task data structures and state management
├── tools/
│   └── runTasks.ts             # Task planning and execution tool
├── commands/
│   └── tasks.ts                # Chat commands for task management
├── chatCommands.ts             # Command exports
├── tools.ts                    # Tool exports
├── contextHandlers.ts          # Context handler exports
├── contextHandlers/
│   └── taskPlan.ts             # Task plan context handler
├── plugin.ts                   # Plugin configuration
├── package.json                # Package metadata and dependencies
└── README.md                   # This documentation
```

## Core Components

### TaskService

The main service that manages the complete task lifecycle:

```typescript
class TaskService implements TokenRingService {
  name = "TaskService";
  description = "Provides task management functionality";
  
  // Task management
  addTask(task: Omit<Task, 'id' | 'status'>, agent: Agent): string;
  getTasks(agent: Agent): Task[];
  updateTaskStatus(id: string, status: Task['status'], result: string | undefined, agent: Agent): void;
  clearTasks(agent: Agent): void;
  
  // Configuration
  getAutoApprove(agent: Agent): number;
  setAutoApprove(seconds: number, agent: Agent): void;
  setParallelTasks(parallelTasks: number, agent: Agent): void;
  
  // Task execution
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
class TaskState implements AgentStateSlice {
  tasks: Task[];                 // Array of all tasks
  autoApprove: number;           // Auto-approve timeout in seconds
  parallelTasks: number;         // Maximum parallel task execution
  
  // State management methods
  serialize(): object;
  deserialize(data: any): void;
  show(): string[];
}
```

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
taskService.setAutoApprove(30, agent); // 30 second auto-approve
taskService.setAutoApprove(0, agent);  // Disable auto-approve

// Configure parallel task execution
taskService.setParallelTasks(3, agent); // Allow 3 tasks to run simultaneously

// Get current configuration
const autoApproveTimeout = taskService.getAutoApprove(agent);
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

**Description**: "Create and present a complete task plan to the user for approval (unless auto-approve is enabled). If approved, this will execute all tasks immediately and return results. If not approved, this will return a reason for rejection."

**Input Schema**:
```typescript
{
  tasks: z.array(z.object({
    taskName: z.string().describe("A descriptive name for the task"),
    agentType: z.string().describe("The type of agent that should handle this task"),
    message: z.string().describe("A one paragraph message/description of what needs to be done, to send to the agent."),
    context: z.string().describe("Three paragraphs of important contextual information to pass to the agent, such as file names, step by step instructions, descriptions, etc. of the exact steps the agent should take. This information is critical to proper agent functionality, and should be detailed and comprehensive. It needs to explain absolutely every aspect of how to complete the task to the agent that will be dispatched")
  })).describe("Array of tasks to add to the task list")
}
```

**Behavior**:
- Presents task plan to user for approval
- Respects auto-approve configuration if set
- If approved: adds tasks and executes them with parallel processing
- If rejected: prompts for rejection reason and returns it

## Command Reference

### /tasks

Manage task list with comprehensive subcommands:

**Description**: "/tasks - Manage and execute tasks in the task queue."

**Subcommands**:

#### list
Display all tasks in the current task queue with their status, agent type, and message content.

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
```

#### clear
Remove all tasks from the current task queue. This action cannot be undone.

**Example**:
```
/tasks clear
```

**Output**: `Cleared all tasks`

#### execute
Execute all pending tasks by dispatching them to their respective agents. Only tasks with 'pending' status will be executed.

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

#### auto-approve
Set the timeout in seconds before tasks are automatically approved. Set to 0 to disable auto-approval.

**Example**:
```
/tasks auto-approve 30
/tasks auto-approve 0
```

**Output**: 
- `Auto-approve enabled with 30s timeout`
- `Auto-approve disabled`

#### parallel
Set the number of tasks that can run in parallel (default: 1).

**Example**:
```
/tasks parallel 3
```

**Output**: `Parallel tasks set to 3`

## API Reference

### Service Methods

#### `addTask(task, agent)`

Add a single task to the task list.

**Parameters**:
- `task`: `Omit<Task, 'id' | 'status'>` - Task data without ID and status
- `agent`: `Agent` - Current agent instance

**Returns**: `string` - The generated task ID

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

**Returns**: `Task[]` - Array of all tasks

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
- `taskIds`: `string[]` - IDs of tasks to execute
- `parentAgent`: `Agent` - Current parent agent instance

**Returns**: `Promise<string[]>` - Array of execution summaries

**Example**:
```typescript
const results = await taskService.executeTasks([taskId1, taskId2], agent);
console.log(results); // ['✓ Task 1: Completed', '✗ Task 2: Failed - Error message']
```

#### `getAutoApprove(agent)`

Get the current auto-approve timeout setting.

**Parameters**:
- `agent`: `Agent` - Current agent instance

**Returns**: `number` - Auto-approve timeout in seconds (0 = disabled)

#### `setAutoApprove(seconds, agent)`

Set the auto-approve timeout.

**Parameters**:
- `seconds`: `number` - Timeout in seconds (0 = disabled)
- `agent`: `Agent` - Current agent instance

**Example**:
```typescript
taskService.setAutoApprove(45, agent); // Auto-approve after 45 seconds
```

#### `setParallelTasks(parallelTasks, agent)`

Set the maximum number of tasks to execute in parallel.

**Parameters**:
- `parallelTasks`: `number` - Maximum parallel tasks (minimum: 1)
- `agent`: `Agent` - Current agent instance

**Example**:
```typescript
taskService.setParallelTasks(3, agent); // Allow 3 parallel tasks
```

### Context Handlers

#### task-plan
Provides current task summaries to agents as context.

**Usage**: Automatically integrated when plugin is installed

**Example**:
```typescript
// Agent receives context like:
/* The user has approved the following task plan */:
- Create user authentication (pending): backend-developer - Implement JWT-based authentication
- Design login UI (pending): frontend-developer - Create responsive login forms
```

## Configuration

### Auto-Approve
- **Purpose**: Automatically approve task plans after a timeout
- **Range**: 0 (disabled) to any positive integer (seconds)
- **Default**: 5 seconds
- **Usage**: Set via `/tasks auto-approve [seconds]` or `setAutoApprove(seconds, agent)`

### Parallel Tasks
- **Purpose**: Control concurrent task execution
- **Range**: 1 to any positive integer
- **Default**: 1 (sequential execution)
- **Usage**: Set via `/tasks parallel [count]` or `setParallelTasks(count, agent)`

### Task Context
- **Message**: One paragraph describing the task objective
- **Context**: Three+ paragraphs with detailed execution instructions
- **Requirement**: Must include file paths, technical specifications, and step-by-step instructions

## Dependencies

- `@tokenring-ai/agent@0.2.0`: Core agent framework and types
- `@tokenring-ai/app@0.2.0`: Application framework and service management
- `@tokenring-ai/chat@0.2.0`: Chat service and tool integration
- `@tokenring-ai/utility@0.2.0`: Utility functions for formatting and utilities
- `zod`: Schema validation for tool inputs
- `uuid@^13.0.0`: UUID generation for unique task IDs
- `async@^3.2.6`: Async utilities for parallel task execution

## Integration

The package integrates seamlessly with the TokenRing ecosystem:

### Plugin System
- **Automatic Registration**: Plugin automatically registers services and tools
- **Service Dependencies**: Waits for ChatService and AgentCommandService
- **Tool Registration**: Adds tools to ChatService for agent use
- **Command Registration**: Adds chat commands for manual control
- **Context Handler Registration**: Registers task plan context handlers

### Service Integration
- **State Management**: Integrates with Agent state system via TaskState
- **Service Injection**: Available via `agent.requireServiceByType(TaskService)`
- **Lifecycle**: Attaches to agents during initialization

### Tool Integration
- **Tool Discovery**: Tools automatically available to agents via ChatService
- **Schema Validation**: Zod-based input validation for all tool parameters
- **Error Handling**: Comprehensive error handling and user feedback

### Command Integration
- **Slash Commands**: All commands use `/tasks` prefix
- **Parameter Parsing**: Robust parameter parsing and validation
- **Help Integration**: Built-in help system with detailed documentation

## Best Practices

### Task Planning
- **Comprehensive Context**: Provide detailed context with step-by-step instructions
- **Clear Agent Assignment**: Use appropriate agent types for each task
- **Dependency Management**: Order tasks to handle dependencies properly
- **Context Detail**: Include file paths, technical requirements, and edge cases

### Configuration
- **Auto-Approve**: Use for routine or well-tested task plans
- **Parallel Execution**: Use for independent tasks to improve efficiency
- **Timeout Management**: Set reasonable timeouts based on task complexity

### Error Handling
- **Retry Logic**: Implement retry logic for failed tasks
- **Error Context**: Provide detailed error context in task results
- **Graceful Degradation**: Handle partial task execution failures

### Performance
- **Parallel Limits**: Don't exceed reasonable parallel task limits
- **Memory Management**: Clear completed tasks periodically
- **State Persistence**: Be mindful of state size with many tasks

## Common Use Cases

### Development Workflows
```typescript
// Feature development
await agent.executeTool('tasks_run', {
  tasks: [
    {taskName: "Backend API", agentType: "backend-developer", message: "Create REST API endpoints", context: "..."},
    {taskName: "Frontend Components", agentType: "frontend-developer", message: "Build UI components", context: "..."},
    {taskName: "Integration Tests", agentType: "test-engineer", message: "Create integration tests", context: "..."}
  ]
});
```

### Data Processing
```typescript
// Batch data processing
const taskIds = [];
for (const file of dataFiles) {
  const taskId = taskService.addTask({
    name: `Process ${file}`,
    agentType: "data-processor",
    message: `Process ${file} and extract insights`,
    context: `Load ${file}, apply transformation rules, validate data quality, and generate summary report.`
  }, agent);
  taskIds.push(taskId);
}

await taskService.executeTasks(taskIds, agent);
```

### Content Creation
```typescript
// Content production pipeline
await agent.executeTool('tasks_run', {
  tasks: [
    {taskName: "Research", agentType: "researcher", message: "Gather information on topic", context: "..."},
    {taskName: "Writing", agentType: "writer", message: "Create draft content", context: "..."},
    {taskName: "Review", agentType: "editor", message: "Review and edit content", context: "..."}
  ]
});
```

## Error Handling

### Task Execution Errors
- **Network Issues**: Tasks fail gracefully with error messages
- **Agent Unavailable**: Proper error handling for missing agent types
- **Timeout**: Configurable timeouts for task execution
- **Partial Failures**: Individual task failures don't stop other tasks

### Recovery Strategies
- **Retry Failed Tasks**: Use `/tasks execute` to retry failed tasks
- **Clear and Restart**: Use `/tasks clear` to reset and start fresh
- **Status Inspection**: Use `/tasks list` to identify specific failures

## License

MIT License. Part of the TokenRing AI ecosystem.