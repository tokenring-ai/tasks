import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskState, Task } from './state/taskState';
import Agent from '@tokenring-ai/agent/Agent';

describe('TaskState', () => {
  let taskState: TaskState;

  beforeEach(() => {
    taskState = new TaskState();
  });

  afterEach(() => {
    taskState = new TaskState();
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(taskState.tasks).toEqual([]);
      expect(taskState.autoApprove).toBe(5);
      expect(taskState.parallelTasks).toBe(1);
    });

    it('should initialize with custom values', () => {
      const customTasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'test-agent',
          message: 'Test message',
          context: 'Test context',
          status: 'pending' as const,
        },
      ];

      taskState = new TaskState({
        tasks: customTasks,
        autoApprove: 30,
        parallelTasks: 3,
      });

      expect(taskState.tasks).toEqual(customTasks);
      expect(taskState.autoApprove).toBe(30);
      expect(taskState.parallelTasks).toBe(3);
    });
  });

  describe('transferStateFromParent', () => {
    it('should transfer state from parent agent', () => {
      const parentAgent = {
        getState: () => ({
          serialize: () => ({
            tasks: [
              {
                id: '1',
                name: 'Transferred Task',
                agentType: 'agent',
                message: 'Message',
                context: 'Context',
                status: 'completed' as const,
              },
            ],
            autoApprove: 45,
            parallelTasks: 2,
          }),
        }),
      } as unknown as Agent;

      taskState.transferStateFromParent(parentAgent);

      expect(taskState.tasks).toHaveLength(1);
      expect(taskState.tasks[0].name).toBe('Transferred Task');
      expect(taskState.autoApprove).toBe(45);
      expect(taskState.parallelTasks).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset tasks when chat reset is specified', () => {
      taskState.tasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'agent',
          content: 'Message',
          context: 'Context',
          status: 'pending' as const,
        },
      ];

      taskState.reset(['chat']);

      expect(taskState.tasks).toEqual([]);
    });

    it('should not reset tasks when chat is not specified', () => {
      taskState.tasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'agent',
          content: 'Message',
          context: 'Context',
          status: 'pending' as const,
        },
      ];

      taskState.reset(['system']);

      expect(taskState.tasks).toHaveLength(1);
    });
  });

  describe('serialize', () => {
    it('should serialize state correctly', () => {
      const tasks = [
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
          status: 'completed' as const,
          result: 'Task completed successfully',
        },
      ];

      taskState.tasks = tasks;
      taskState.autoApprove = 30;
      taskState.parallelTasks = 3;

      const serialized = taskState.serialize();

      expect(serialized).toEqual({
        tasks,
        autoApprove: 30,
        parallelTasks: 3,
      });
    });
  });

  describe('deserialize', () => {
    it('should deserialize state correctly', () => {
      const data = {
        tasks: [
          {
            id: '1',
            name: 'Task 1',
            agentType: 'agent1',
            message: 'Message 1',
            context: 'Context 1',
            status: 'pending' as const,
          },
        ],
        autoApprove: 45,
        parallelTasks: 2,
      };

      taskState.deserialize(data);

      expect(taskState.tasks).toHaveLength(1);
      expect(taskState.tasks[0].name).toBe('Task 1');
      expect(taskState.autoApprove).toBe(45);
      expect(taskState.parallelTasks).toBe(2);
    });

    it('should handle missing data gracefully', () => {
      taskState.deserialize({});

      expect(taskState.tasks).toEqual([]);
      expect(taskState.autoApprove).toBe(0);
      expect(taskState.parallelTasks).toBe(1);
    });

    it('should preserve original array references', () => {
      const originalTasks = [
        {
          id: '1',
          name: 'Task 1',
          agentType: 'agent1',
          message: 'Message 1',
          context: 'Context 1',
          status: 'pending' as const,
        },
      ];

      taskState.deserialize({ tasks: originalTasks });

      expect(taskState.tasks).not.toBe(originalTasks);
      expect(taskState.tasks).toEqual(originalTasks);
    });
  });

  describe('show', () => {
    it('should show empty state', () => {
      const output = taskState.show();

      expect(output).toEqual([
        'Total Tasks: 0',
        'Auto-approve: 5s',
        'Parallel tasks: 1',
      ]);
    });

    it('should show state with tasks and counts', () => {
      taskState.tasks = [
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
          status: 'running' as const,
        },
        {
          id: '3',
          name: 'Task 3',
          agentType: 'agent1',
          message: 'Message 3',
          context: 'Context 3',
          status: 'completed' as const,
        },
        {
          id: '4',
          name: 'Task 4',
          agentType: 'agent3',
          message: 'Message 4',
          context: 'Context 4',
          status: 'failed' as const,
        },
      ];

      taskState.autoApprove = 30;
      taskState.parallelTasks = 3;

      const output = taskState.show();

      expect(output).toEqual([
        'Total Tasks: 4',
        '  pending: 1',
        '  running: 1',
        '  completed: 1',
        '  failed: 1',
        'Auto-approve: 30s',
        'Parallel tasks: 3',
      ]);
    });

    it('should handle zero auto-approve', () => {
      taskState.autoApprove = 0;

      const output = taskState.show();

      expect(output).toContain('Auto-approve: disabled');
    });

    it('should handle positive auto-approve', () => {
      taskState.autoApprove = 5;

      const output = taskState.show();

      expect(output).toContain('Auto-approve: 5s');
    });
  });

  describe('Task State Management', () => {
    it('should handle task lifecycle', () => {
      const task: Task = {
        id: '1',
        name: 'Test Task',
        agentType: 'test-agent',
        message: 'Test message',
        context: 'Test context',
        status: 'pending',
      };

      taskState.tasks = [task];

      // Task starts as pending
      expect(taskState.tasks[0].status).toBe('pending');

      // Update to running
      taskState.tasks[0].status = 'running';
      expect(taskState.tasks[0].status).toBe('running');

      // Update to completed
      taskState.tasks[0].status = 'completed';
      taskState.tasks[0].result = 'Success!';
      expect(taskState.tasks[0].status).toBe('completed');
      expect(taskState.tasks[0].result).toBe('Success!');
    });

    it('should handle task with undefined result', () => {
      const task: Task = {
        id: '1',
        name: 'Test Task',
        agentType: 'test-agent',
        message: 'Test message',
        context: 'Test context',
        status: 'pending',
      };

      taskState.tasks = [task];

      expect(taskState.tasks[0].result).toBeUndefined();
    });
  });
});