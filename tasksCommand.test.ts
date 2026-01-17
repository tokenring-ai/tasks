import Agent from '@tokenring-ai/agent/Agent';
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import tasksCommand from './commands/tasks';
import TaskService from './TaskService';

// Mock dependencies
vi.mock('./TaskService');

const app = createTestingApp();

// Create a mock agent
const createMockAgent = () => {
  const agent = createTestingAgent(app);
  vi.spyOn(agent, 'requireServiceByType');
  vi.spyOn(agent, 'chatOutput');
  vi.spyOn(agent, 'infoMessage');
  vi.spyOn(agent, 'errorMessage');

  return agent;
};

describe('tasks Command', () => {
  let mockAgent: Agent;
  let mockTaskService: TaskService;

  beforeEach(() => {
    mockAgent = createMockAgent();
    mockTaskService = {
      getTasks: vi.fn(),
      clearTasks: vi.fn(),
      executeTasks: vi.fn(),
      setAutoApprove: vi.fn(),
      setParallelTasks: vi.fn(),
    } as unknown as TaskService;

    vi.mocked(mockAgent.requireServiceByType).mockReturnValue(mockTaskService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Command Metadata', () => {
    it('should have correct command definition', () => {
      expect(tasksCommand.description).toBe('/tasks - Manage and execute tasks in the task queue.');
      expect(tasksCommand.help).toContain('TASKS COMMAND');
    });
  });

  describe('No Operation Provided', () => {
    it('should display help when no operation provided', () => {
      tasksCommand.execute('', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(tasksCommand.help);
    });

    it('should display help when empty string provided', () => {
      tasksCommand.execute('  ', mockAgent);

      expect(mockAgent.chatOutput).toHaveBeenCalledWith(tasksCommand.help);
    });
  });

  describe('list Operation', () => {
    it('should display message when no tasks exist', () => {
      vi.mocked(mockTaskService.getTasks).mockReturnValue([]);

      tasksCommand.execute('list', mockAgent);

      expect(mockAgent.infoMessage).toHaveBeenCalledWith('No tasks in the list');
    });

    it('should list all tasks when tasks exist', () => {
      const mockTasks = [
        {
          id: '1',
          name: 'Process Data',
          agentType: 'data-processor',
          message: 'Process the uploaded CSV file',
          context: 'File path: ',
          status: 'pending' as const,
        },
        {
          id: '2',
          name: 'Send Email',
          agentType: 'email-sender',
          message: 'Send confirmation email',
          context: 'Email address: ',
          status: 'completed' as const,
          result: 'Email sent successfully',
        },
      ];

      vi.mocked(mockTaskService.getTasks).mockReturnValue(mockTasks);

      tasksCommand.execute('list', mockAgent);

      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Current tasks:');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('[0] Process Data (pending)');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('    Agent: data-processor');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('    Message: Process the uploaded CSV file');
      
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('[1] Send Email (completed)');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('    Agent: email-sender');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('    Message: Send confirmation email');
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('    Result: Email sent successfully...');
    });

    it('should truncate long results', () => {
      const mockTasks = [
        {
          id: '1',
          name: 'Test Task',
          agentType: 'test-agent',
          message: 'Test message',
          context: 'Test context',
          status: 'completed' as const,
          result: 'This is a very long result that should be truncated to show only the first 100 characters in the output display to keep the interface clean and readable for the user',
        },
      ];

      vi.mocked(mockTaskService.getTasks).mockReturnValue(mockTasks);

      tasksCommand.execute('list', mockAgent);

      expect(mockAgent.infoMessage).toHaveBeenCalledWith(
        '    Result: This is a very long result that should be truncated to show only the first 100 characters in the out...'
      );
    });
  });

  describe('clear Operation', () => {
    it('should clear all tasks', () => {
      tasksCommand.execute('clear', mockAgent);

      expect(mockTaskService.clearTasks).toHaveBeenCalledWith(mockAgent);
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Cleared all tasks');
    });
  });

  describe('execute Operation', () => {
    it('should execute pending tasks', async () => {
      const mockTasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'agent1',
          message: 'Message 1',
          context: 'Context 1',
          status: 'pending' as const,
        },
        {
          id: '2',
          name: 'Task 2',
          agentType: 'agent2',
          message: 'Message 2',
          context: 'Context 2',
          status: 'completed' as const, // This should be filtered out
        },
      ];

      vi.mocked(mockTaskService.getTasks).mockReturnValue(mockTasks);
      vi.mocked(mockTaskService.executeTasks).mockResolvedValue(['✓ Task 1: Completed']);

      await tasksCommand.execute('execute', mockAgent);

      expect(mockTaskService.executeTasks).toHaveBeenCalledWith(['1'], mockAgent);
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Task execution completed:\n✓ Task 1: Completed');
    });

    it('should handle no pending tasks', () => {
      const mockTasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'agent1',
          message: 'Message 1',
          context: 'Context 1',
          status: 'completed' as const,
        },
      ];

      vi.mocked(mockTaskService.getTasks).mockReturnValue(mockTasks);

      tasksCommand.execute('execute', mockAgent);

      expect(mockAgent.infoMessage).toHaveBeenCalledWith('No pending tasks to execute');
      expect(mockTaskService.executeTasks).not.toHaveBeenCalled();
    });
  });

  describe('auto-approve Operation', () => {
    it('should set auto-approve with valid number', () => {
      tasksCommand.execute('auto-approve 30', mockAgent);

      expect(mockTaskService.setAutoApprove).toHaveBeenCalledWith(30, mockAgent);
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Auto-approve enabled with 30s timeout');
    });

    it('should disable auto-approve with zero', () => {
      tasksCommand.execute('auto-approve 0', mockAgent);

      expect(mockTaskService.setAutoApprove).toHaveBeenCalledWith(0, mockAgent);
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Auto-approve disabled');
    });

    it('should handle invalid number', () => {
      tasksCommand.execute('auto-approve abc', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks auto-approve [seconds >= 0]');
      expect(mockTaskService.setAutoApprove).not.toHaveBeenCalled();
    });

    it('should handle negative number', () => {
      tasksCommand.execute('auto-approve -5', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks auto-approve [seconds >= 0]');
      expect(mockTaskService.setAutoApprove).not.toHaveBeenCalled();
    });

    it('should handle missing parameter', () => {
      tasksCommand.execute('auto-approve', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks auto-approve [seconds >= 0]');
      expect(mockTaskService.setAutoApprove).not.toHaveBeenCalled();
    });
  });

  describe('parallel Operation', () => {
    it('should set parallel tasks with valid number', () => {
      tasksCommand.execute('parallel 5', mockAgent);

      expect(mockTaskService.setParallelTasks).toHaveBeenCalledWith(5, mockAgent);
      expect(mockAgent.infoMessage).toHaveBeenCalledWith('Parallel tasks set to 5');
    });

    it('should handle invalid number', () => {
      tasksCommand.execute('parallel abc', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks parallel [number >= 1]');
      expect(mockTaskService.setParallelTasks).not.toHaveBeenCalled();
    });

    it('should handle number less than 1', () => {
      tasksCommand.execute('parallel 0', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks parallel [number >= 1]');
      expect(mockTaskService.setParallelTasks).not.toHaveBeenCalled();
    });

    it('should handle missing parameter', () => {
      tasksCommand.execute('parallel', mockAgent);

      expect(mockAgent.errorMessage).toHaveBeenCalledWith('Usage: /tasks parallel [number >= 1]');
      expect(mockTaskService.setParallelTasks).not.toHaveBeenCalled();
    });
  });

  describe('Command Parsing', () => {
    it('should handle complex command strings', () => {
      vi.mocked(mockTaskService.getTasks).mockReturnValue([]);

      tasksCommand.execute('list', mockAgent);

      expect(mockAgent.infoMessage).toHaveBeenCalledWith('No tasks in the list');
    });

    it('should handle commands with multiple spaces', () => {
      tasksCommand.execute('auto-approve   30', mockAgent);

      expect(mockTaskService.setAutoApprove).toHaveBeenCalledWith(30, mockAgent);
    });

    it('should handle commands with tabs', () => {
      tasksCommand.execute('auto-approve\t30', mockAgent);

      expect(mockTaskService.setAutoApprove).toHaveBeenCalledWith(30, mockAgent);
    });
  });
});