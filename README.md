# Tasks Package Documentation

## Overview

The `@tokenring-ai/tasks` package provides task planning and execution functionality for AI agents within the TokenRing framework. It enables agents to create comprehensive task plans, present them to users for approval, and automatically execute approved tasks by dispatching them to specialized agents. This package is designed for orchestrating complex multi-step workflows where different agent types handle specific tasks.

Key features:
- Create and manage task plans with multiple tasks
- Present task plans to users for approval via interactive interface
- Automatic task execution upon approval
- Task status tracking (pending, running, completed, failed)
- Integration with agent dispatch system

## Installation/Setup

This package is part of the TokenRing AI ecosystem. To use it:

1. Install as part of the monorepo or add as dependency:
   ```
   npm install @tokenring-ai/tasks
   ```

2. Import and register with your agent:
   ```typescript
   import { TaskService } from '@tokenring-ai/tasks';
   const taskService = new TaskService();
   // Register with agent
   ```

## Package Structure

- **TaskService.ts**: Main service managing task state and operations
- **state/taskState.ts**: Task data structure and state management
- **tools/add-task.ts**: Tool for creating and executing task plans
- **commands/tasks.ts**: Chat commands for task management
- **index.ts**: Package exports and metadata

## Core Components

### TaskService

Main service that manages task lifecycle:
- `addTask()`: Add individual tasks to the list
- `getTasks()`: Retrieve all tasks with current status
- `updateTaskStatus()`: Update task execution status
- `clearTasks()`: Remove all tasks
- `getContextItems()`: Provide task context to agents

### Task Interface

Each task contains:
- `id`: Unique identifier
- `name`: Descriptive task name
- `agentType`: Type of agent to handle the task
- `message`: Main task description
- `context`: Detailed instructions for execution
- `status`: Current state (pending/running/completed/failed)
- `result`: Execution result (if completed)

## Usage Examples

### 1. Creating a Task Plan (Team Leader Agent)

```typescript
// Team leader creates comprehensive task plan
await agent.executeTool('tasks/add', {
  tasks: [
    {
      taskName: "Create user authentication system",
      agentType: "backend-developer", 
      message: "Implement JWT-based authentication with login/logout endpoints",
      context: "Create auth middleware, user model, login/logout routes in Express.js. Use bcrypt for password hashing."
    },
    {
      taskName: "Design login UI components",
      agentType: "frontend-developer",
      message: "Create responsive login and registration forms", 
      context: "Build React components with form validation, error handling, and responsive design using Tailwind CSS."
    },
    {
      taskName: "Write authentication tests",
      agentType: "test-engineer",
      message: "Create comprehensive test suite for auth system",
      context: "Write unit tests for auth middleware, integration tests for login/logout endpoints, and E2E tests for UI flows."
    }
  ]
});
```

### 2. Task Plan Approval Workflow

When the tool executes:
1. **Presents plan to user**:
   ```
   Task Plan:

   1. Create user authentication system (backend-developer)
      Implement JWT-based authentication with login/logout endpoints

   2. Design login UI components (frontend-developer) 
      Create responsive login and registration forms

   3. Write authentication tests (test-engineer)
      Create comprehensive test suite for auth system

   Approve this task plan for execution?
   ```

2. **If approved**: Tasks execute automatically and return results
3. **If rejected**: User explains rejection reason

### 3. Manual Task Management

```bash
# View all tasks and their status
/tasks list

# Clear completed tasks
/tasks clear

# Execute pending tasks manually
/tasks execute
```

## Task Planning Workflow

1. **Planning Phase**: Team leader analyzes requirements and creates comprehensive task plan
2. **Approval Phase**: Task plan presented to user with clear descriptions and agent assignments
3. **Execution Phase**: Upon approval, tasks dispatched to appropriate specialist agents
4. **Tracking Phase**: Task status updated as agents complete their work
5. **Results Phase**: Execution results collected and reported back

## Configuration Options

- **Task Persistence**: Tasks persist across sub-agents for coordination
- **Status Tracking**: Automatic status updates during execution
- **Context Injection**: Task summaries provided to agents as context
- **Agent Dispatch**: Integration with `agent/run` tool for task execution

## API Reference

### Tools
- `tasks/add`: Create and execute complete task plans with user approval

### Commands  
- `/tasks list`: Show all tasks with status
- `/tasks clear`: Remove all tasks
- `/tasks execute`: Execute pending tasks manually

### Service Methods
- `addTask(task, agent)`: Add single task
- `getTasks(agent)`: Get all tasks
- `updateTaskStatus(id, status, result, agent)`: Update task status
- `clearTasks(agent)`: Clear all tasks

## Dependencies

- `@tokenring-ai/agent@0.1.0`: Core agent framework and types
- `@tokenring-ai/utility@0.1.0`: Utility functions
- `zod`: Schema validation for tool inputs

## Contributing/Notes

- **Best Practices**: Create comprehensive task plans with clear agent assignments and detailed context
- **Agent Types**: Ensure specified agent types exist and are capable of handling assigned tasks
- **Context**: Provide detailed instructions in task context for successful execution
- **Testing**: Tasks include comprehensive context for reproducible results

License: MIT. Part of the TokenRing AI ecosystem.