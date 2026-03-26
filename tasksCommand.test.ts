import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import listCommand from './commands/tasks/list.ts';
import executeCommand from './commands/tasks/execute.ts';
import clearCommand from './commands/tasks/clear.ts';
import settingsCommand from './commands/tasks/settings.ts';
import TaskService from './TaskService.ts';
import {TaskState} from "./state/taskState.ts";

describe('Tasks Commands', () => {
  let mockAgent: any;
  let mockTaskService: TaskService;
  let app: any;

  beforeEach(() => {
    app = createTestingApp();
    mockTaskService = new TaskService({
      agentDefaults: {
        autoApprove: 5,
        parallel: 1
      }
    });
    app.addServices(mockTaskService);
    
    mockAgent = createTestingAgent(app);
    mockTaskService.attach(mockAgent);

    vi.spyOn(mockAgent, 'requireServiceByType');
    vi.spyOn(mockAgent, 'chatOutput');
    vi.spyOn(mockAgent, 'infoMessage');
    vi.spyOn(mockAgent, 'errorMessage');

    vi.mocked(mockAgent.requireServiceByType).mockReturnValue(mockTaskService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list Command', () => {
    it('should have correct command metadata', () => {
      expect(listCommand.name).toBe('tasks list');
      expect(listCommand.description).toBe('List all tasks');
    });

    it('should display message when no tasks exist', async () => {
      const result = await listCommand.execute({agent: mockAgent} as any);

      expect(result).toBe('No tasks in the list');
    });

    it('should list all tasks when tasks exist', async () => {
      const mockTask = {
        id: '1',
        name: 'Process Data',
        agentType: 'data-processor',
        message: 'Process the uploaded CSV file',
        context: 'File path: ',
        status: 'pending' as const,
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      const result = await listCommand.execute({agent: mockAgent} as any);

      expect(result).toContain('Current tasks:');
      expect(result).toContain('[0] Process Data (pending)');
      expect(result).toContain('  Agent: data-processor');
      expect(result).toContain('  Message: Process the uploaded CSV file');
    });

    it('should display result for completed tasks', async () => {
      const mockTask = {
        id: '1',
        name: 'Send Email',
        agentType: 'email-sender',
        message: 'Send confirmation email',
        context: 'Email address: ',
        status: 'completed' as const,
        result: 'Email sent successfully with all attachments',
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      const result = await listCommand.execute({agent: mockAgent} as any);

      expect(result).toContain('Result: Email sent successfully with all attachments...');
    });

    it('should truncate long results', async () => {
      const longResult = 'This is a very long result that should be truncated to show only the first 100 characters in the output display to keep the interface clean and readable for the user';
      const mockTask = {
        id: '1',
        name: 'Test Task',
        agentType: 'test-agent',
        message: 'Test message',
        context: 'Test context',
        status: 'completed' as const,
        result: longResult,
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      const result = await listCommand.execute({agent: mockAgent} as any);

      expect(result).toContain('Result: This is a very long result that should be truncated to show only the first 100 characters in the out...');
    });
  });

  describe('execute Command', () => {
    it('should have correct command metadata', () => {
      expect(executeCommand.name).toBe('tasks execute');
      expect(executeCommand.description).toBe('Execute pending tasks');
    });

    it('should display message when no pending tasks exist', async () => {
      const result = await executeCommand.execute({agent: mockAgent} as any);

      expect(result).toBe('No pending tasks to execute');
    });

    it('should execute pending tasks', async () => {
      const mockTask = {
        id: '1',
        name: 'Task 1',
        agentType: 'agent1',
        message: 'Message 1',
        context: 'Context 1',
        status: 'pending' as const,
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      vi.spyOn(mockTaskService, 'executeTasks').mockResolvedValue(['✓ Task 1: Completed']);

      const result = await executeCommand.execute({agent: mockAgent} as any);

      expect(result).toContain('Task execution completed:');
      expect(result).toContain('✓ Task 1: Completed');
    });

    it('should not execute completed tasks', async () => {
      const mockTask = {
        id: '1',
        name: 'Task 1',
        agentType: 'agent1',
        message: 'Message 1',
        context: 'Context 1',
        status: 'completed' as const,
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      // Spy on executeTasks to verify it's not called
      const executeTasksSpy = vi.spyOn(mockTaskService, 'executeTasks');
      
      const result = await executeCommand.execute({agent: mockAgent} as any);

      expect(result).toBe('No pending tasks to execute');
      expect(executeTasksSpy).not.toHaveBeenCalled();
      executeTasksSpy.mockRestore();
    });
  });

  describe('clear Command', () => {
    it('should have correct command metadata', () => {
      expect(clearCommand.name).toBe('tasks clear');
      expect(clearCommand.description).toBe('Clear all tasks');
    });

    it('should clear all tasks', async () => {
      const mockTask = {
        id: '1',
        name: 'Task 1',
        agentType: 'agent1',
        message: 'Message 1',
        context: 'Context 1',
        status: 'pending' as const,
      };

      mockAgent.mutateState(TaskState, (state: any) => {
        state.tasks.push(mockTask);
      });

      const result = await clearCommand.execute({agent: mockAgent} as any);

      expect(result).toBe('Cleared all tasks');
      expect(mockAgent.getState(TaskState).tasks.length).toBe(0);
    });
  });

  describe('settings Command', () => {
    it('should have correct command metadata', () => {
      expect(settingsCommand.name).toBe('tasks settings');
      expect(settingsCommand.description).toBe('View or modify task settings');
    });

    it('should display current settings when no arguments', async () => {
      const result = await settingsCommand.execute({remainder: '', agent: mockAgent} as any);

      expect(result).toContain('Task Settings:');
      expect(result).toContain('Auto-approve: 5s');
      expect(result).toContain('Parallel tasks: 1');
    });

    it('should set auto-approve with valid number', async () => {
      const result = await settingsCommand.execute({remainder: 'auto-approve=30', agent: mockAgent} as any);

      expect(result).toBe('Auto-approve enabled with 30s timeout');
      expect(mockAgent.getState(TaskState).autoApprove).toBe(30);
    });

    it('should disable auto-approve with zero', async () => {
      const result = await settingsCommand.execute({remainder: 'auto-approve=0', agent: mockAgent} as any);

      expect(result).toBe('Auto-approve disabled');
      expect(mockAgent.getState(TaskState).autoApprove).toBe(0);
    });

    it('should handle invalid auto-approve value', async () => {
      await expect(settingsCommand.execute({remainder: 'auto-approve=abc', agent: mockAgent} as any))
        .rejects.toThrow('auto-approve must be >= 0');
    });

    it('should handle negative auto-approve value', async () => {
      await expect(settingsCommand.execute({remainder: 'auto-approve=-5', agent: mockAgent} as any))
        .rejects.toThrow('auto-approve must be >= 0');
    });

    it('should set parallel tasks with valid number', async () => {
      const result = await settingsCommand.execute({remainder: 'parallel=5', agent: mockAgent} as any);

      expect(result).toBe('Parallel tasks set to 5');
      expect(mockAgent.getState(TaskState).parallelTasks).toBe(5);
    });

    it('should handle invalid parallel value', async () => {
      await expect(settingsCommand.execute({remainder: 'parallel=abc', agent: mockAgent} as any))
        .rejects.toThrow('parallel must be >= 1');
    });

    it('should handle parallel value less than 1', async () => {
      await expect(settingsCommand.execute({remainder: 'parallel=0', agent: mockAgent} as any))
        .rejects.toThrow('parallel must be >= 1');
    });

    it('should handle invalid setting format', async () => {
      await expect(settingsCommand.execute({remainder: 'invalid-setting', agent: mockAgent} as any))
        .rejects.toThrow('Invalid setting: invalid-setting');
    });

    it('should handle multiple settings', async () => {
      const result = await settingsCommand.execute({remainder: 'auto-approve=30 parallel=3', agent: mockAgent} as any);

      expect(result).toContain('Auto-approve enabled with 30s timeout');
      expect(result).toContain('Parallel tasks set to 3');
      expect(mockAgent.getState(TaskState).autoApprove).toBe(30);
      expect(mockAgent.getState(TaskState).parallelTasks).toBe(3);
    });
  });
});
