# @tokenring-ai/tasks

A task management service for the TokenRing AI ecosystem that enables agents to create, manage, and execute comprehensive task plans with user approval workflows.

## Overview

The `@tokenring-ai/tasks` package provides a complete task planning and execution framework for AI agents within the TokenRing system. It allows agents to create detailed task plans, present them to users for approval, and automatically execute approved tasks by dispatching them to specialized agents.

### Key Features

- **Task Planning**: Create comprehensive task plans with multiple tasks
- **User Approval Workflow**: Interactive task plan approval system
- **Automatic Execution**: Execute approved tasks immediately upon confirmation
- **Task Status Tracking**: Monitor task states (pending, running, completed, failed)
- **Agent Dispatch Integration**: Seamlessly integrate with existing agent system
- **Context Management**: Provide detailed context to agents for successful execution
- **Manual Task Management**: Chat commands for task inspection and control

## Installation

This package is part of the TokenRing AI ecosystem. Install it as a dependency:

```bash
npm install @tokenring-ai/tasks
```

## Package Structure

```
pkg/tasks/
├── index.ts              # Package exports and plugin registration
├── TaskService.ts        # Main task management service
├── state/
│   └── taskState.ts      # Task data structures and state management
├── tools/
│   └── runTasks.ts       # Task planning and execution tool
├── commands/
│   └── tasks.ts          # Chat commands for task management
├── chatCommands.ts       # Command exports
├── tools.ts              # Tool exports
├── package.json          # Package metadata and dependencies
└── README.md             # This documentation
```

## Core Components

### TaskService

The main service that manages the complete task lifecycle:

```typescript
class TaskService implements TokenRingService {
  // Task management
  addTask(task: Omit<Task, 'id' | 'status'>, agent: Agent): string
  getTasks(agent: Agent): Task[]
  updateTaskStatus(id: string, status: Task['status'], result?: string, agent: Agent): void
  clearTasks(agent: Agent): void
  
  // Task execution
  executeTasks(taskIds: string[], agent: Agent): Promise<string[]>
  
  // Context integration
  getContextItems(agent: Agent): AsyncGenerator<ContextItem>
}
```

### Task Interface

Each task contains comprehensive information for execution:

```typescript
interface Task {
  id: string;                    // Unique identifier
  name: string;                  // Descriptive task name
  agentType: string;             // Type of agent to handle the task
  message: string;               // Main task description (1 paragraph)
  context: string;               // Detailed execution instructions (3+ paragraphs)
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;               // Execution result if completed
}
```

## Usage Examples

### 1. Using the Task Planning Tool

The primary way to create and execute task plans:

```typescript
// Create a comprehensive task plan
await agent.executeTool('tasks/run', {
  tasks: [
    {
      taskName: "Create user authentication system",
      agentType: "backend-developer", 
      message: "Implement JWT-based authentication with login/logout endpoints",
      context: "Create auth middleware, user model, login/logout routes in Express.js. Use bcrypt for password hashing. Include proper error handling and validation. Set up appropriate HTTP status codes and response formats."
    },
    {
      taskName: "Design login UI components",
      agentType: "frontend-developer",
      message: "Create responsive login and registration forms", 
      context: "Build React components with form validation, error handling, and responsive design using Tailwind CSS. Include loading states, proper accessibility attributes, and consistent styling with the application's design system."
    },
    {
      taskName: "Write authentication tests",
      agentType: "test-engineer",
      message: "Create comprehensive test suite for auth system",
      context: "Write unit tests for auth middleware, integration tests for login/logout endpoints, and E2E tests for UI flows. Include edge cases like invalid credentials, expired tokens, and concurrent access scenarios. Ensure proper test coverage and maintainable test structure."
    }
  ]
});
```

### 2. Manual Task Management via Chat Commands

```bash
# View all tasks and their current status
/tasks list

# Clear all tasks from the list
/tasks clear

# Execute all pending tasks manually
/tasks execute
```

### 3. Programmatic Task Management

```typescript
import TaskService from '@tokenring-ai/tasks';

const taskService = agent.requireServiceByType(TaskService);

// Add individual tasks
const taskId = taskService.addTask({
  name: "Process user data",
  agentType: "data-processor",
  message: "Clean and validate user input data",
  context: "Parse CSV files, remove duplicates, validate email formats, and standardize data formats. Handle missing values appropriately and generate summary reports."
}, agent);

// Get all tasks
const allTasks = taskService.getTasks(agent);

// Update task status
taskService.updateTaskStatus(taskId, 'completed', 'Data processed successfully', agent);

// Execute specific tasks
const results = await taskService.executeTasks([taskId], agent);
```

## Task Planning Workflow

1. **Planning Phase**: Create comprehensive task plans with detailed context
2. **Approval Phase**: Task plan presented to user with clear descriptions and agent assignments
3. **Execution Phase**: Upon approval, tasks are added and executed immediately
4. **Tracking Phase**: Task status updated in real-time as agents complete work
5. **Results Phase**: Execution results collected and reported back

## Tool Reference

### tasks/run

Create and present a complete task plan to the user for approval. If approved, execute all tasks immediately.

**Input Schema**:
```typescript
{
  tasks: Array<{
    taskName: string;        // Descriptive name for the task
    agentType: string;       // Type of agent that should handle this task
    message: string;         // One paragraph description of what needs to be done
    context: string;         // Three+ paragraphs of detailed execution instructions
  }>
}
```

**Behavior**:
- Presents task plan to user for approval
- If approved: adds tasks and executes them immediately
- If rejected: prompts for rejection reason and returns it

## Command Reference

### /tasks

Manage task list with subcommands:

- **list**: Show all tasks with their status, agent type, and results
- **clear**: Remove all tasks from the list
- **execute**: Execute all pending tasks by dispatching them to agents

## API Reference

### Service Methods

#### `addTask(task, agent)`
Add a single task to the task list.

**Parameters**:
- `task`: `Omit<Task, 'id' | 'status'>` - Task data without ID and status
- `agent`: `Agent` - Current agent instance

**Returns**: `string` - The generated task ID

#### `getTasks(agent)`
Retrieve all tasks with their current status.

**Parameters**:
- `agent`: `Agent` - Current agent instance

**Returns**: `Task[]` - Array of all tasks

#### `updateTaskStatus(id, status, result?, agent)`
Update the status and optionally the result of a task.

**Parameters**:
- `id`: `string` - Task ID
- `status`: `Task['status']` - New status
- `result`: `string | undefined` - Execution result (optional)
- `agent`: `Agent` - Current agent instance

#### `clearTasks(agent)`
Remove all tasks from the task list.

**Parameters**:
- `agent`: `Agent` - Current agent instance

#### `executeTasks(taskIds, agent)`
Execute a list of tasks sequentially.

**Parameters**:
- `taskIds`: `string[]` - IDs of tasks to execute
- `agent`: `Agent` - Current agent instance

**Returns**: `Promise<string[]>` - Array of execution summaries

#### `getContextItems(agent)`
Generate context items for agents based on current task state.

**Parameters**:
- `agent`: `Agent` - Current agent instance

**Returns**: `AsyncGenerator<ContextItem>` - Context items for agent use

## Dependencies

- `@tokenring-ai/agent@0.1.0`: Core agent framework and types
- `@tokenring-ai/utility@0.1.0`: Utility functions  
- `uuid@^13.0.0`: UUID generation for task IDs
- `zod`: Schema validation for tool inputs

## Integration

The package integrates seamlessly with the TokenRing ecosystem:

- **Plugin System**: Automatically registers services and tools
- **Chat Integration**: Adds tools to ChatService for agent use
- **Command Integration**: Adds chat commands for manual control
- **State Management**: Persists task state across agent instances
- **Context Integration**: Provides task summaries to agents

## Best Practices

### Task Planning
- Create comprehensive task plans with clear agent assignments
- Provide detailed context with step-by-step instructions
- Include file names, technical requirements, and edge cases
- Ensure context is detailed enough for reproducible results

### Agent Selection
- Use appropriate agent types for each task
- Verify that specified agent types exist and are capable
- Consider dependencies between tasks when ordering

### Context Guidelines
- **Message**: One paragraph describing the task objective
- **Context**: Three+ paragraphs with detailed execution instructions
- Include technical specifications, file paths, and requirements
- Explain exactly how to complete the task

## License

MIT License. Part of the TokenRing AI ecosystem.