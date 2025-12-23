import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import context from "@tokenring-ai/chat/commands/chat/context";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TaskService from './TaskService';
import { TaskState } from './state/taskState';
import Agent from '@tokenring-ai/agent/Agent';

const app = createTestingApp();

describe('TaskService', () => {
  let taskService: TaskService;
  let agent: Agent;

  beforeEach(() => {
    taskService = new TaskService();
    agent = createTestingAgent(app);
    taskService.attach(agent);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Properties', () => {
    it('should have correct service metadata', () => {
      expect(taskService.name).toBe('TaskService');
      expect(taskService.description).toBe('Provides task management functionality');
    });
  });

  describe('attach', () => {
    it('should initialize agent state', () => {
      vi.spyOn(agent, 'initializeState');
      taskService.attach(agent);
      
      expect(agent.initializeState).toHaveBeenCalledWith(TaskState, {});
    });
  });

  describe('addTask', () => {
    it('should add a new task with generated ID', () => {
      const taskData = {
        name: 'Test Task',
        agentType: 'test-agent',
        message: 'Test message',
        context: 'Test context',
      };
      vi.spyOn(agent, 'mutateState');

      const taskId = taskService.addTask(taskData, agent);

      expect(taskId).matches(/-/);

      const tasks = taskService.getTasks(agent);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        ...taskData,
        id: taskId,
        status: 'pending',
      });
    });

    it('should handle multiple tasks', () => {
      const taskData = {
        name: 'Test Task',
        agentType: 'test-agent',
        message: 'Test message',
        context: 'Test context',
      };

      taskService.addTask(taskData, agent);
      taskService.addTask(taskData, agent);

      const tasks = taskService.getTasks(agent);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).not.toBe(tasks[1].id);
    });
  });

  describe('getTasks', () => {
    it('should return empty array when no tasks', () => {
      const tasks = taskService.getTasks(agent);
      expect(tasks).toEqual([]);
    });

    it('should return all tasks', () => {
      const testTasks = [
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
      ];

      taskService.addTask(testTasks[0], agent);
      taskService.addTask(testTasks[1], agent);

      const tasks = taskService.getTasks(agent);
      
      expect(tasks).toMatchObject(
        testTasks.map(
          ({ id, status, ...t}) =>
            ({ ...t, status: 'pending', id: expect.stringMatching(/-/) })
          )
        );
      expect(tasks[0]).not.toBe(testTasks[0]); // Should return a copy
    });
  });

  describe('clearTasks', () => {
    it('should clear all tasks', () => {
      taskService.addTask({ name: 'Test Task', agentType: 'test-agent', message: 'Test message', context: 'Test context' }, agent);
      taskService.addTask({ name: 'Test Task 2', agentType: 'test-agent', message: 'Test message 2', context: 'Test context 2' }, agent);

      taskService.clearTasks(agent);

      const tasks = taskService.getTasks(agent);

      expect(tasks).toHaveLength(0);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update existing task status', () => {
      const taskId = taskService.addTask({ name: 'Test Task', agentType: 'test-agent', message: 'Test message', context: 'Test context' }, agent);

      taskService.updateTaskStatus(taskId, 'completed', 'Success result', agent);

      const tasks = taskService.getTasks(agent);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].result).toBe('Success result');
    });

    it('should handle non-existent task', () => {
      try {
        taskService.updateTaskStatus('non-existent', 'completed', 'Result', agent)
        expect.unreachable('Expected error to be thrown');
      } catch (err) {
        expect(err.message).toBe('Task non-existent not found');
      }
    });

    it('should handle undefined result', () => {
      const taskId = taskService.addTask({ name: 'Test Task', agentType: 'test-agent', message: 'Test message', context: 'Test context' }, agent);

      taskService.updateTaskStatus(taskId, 'running', undefined, agent);

      const tasks = taskService.getTasks(agent);
      expect(tasks).toHaveLength(1);
      const updatedTask = tasks.find(t => t.id === taskId);
      expect(updatedTask?.status).toBe('running');
      expect(updatedTask?.result).toBeUndefined();
    });
  });

  describe('Auto-approve Configuration', () => {
    describe('getAutoApprove', () => {
      it('should return default auto-approve setting', () => {
        taskService.setAutoApprove(2, agent);
        const result = taskService.getAutoApprove(agent);
        expect(result).toBe(2);
      });
    });

    describe('setAutoApprove', () => {
      it('should set auto-approve timeout', () => {
        taskService.setAutoApprove(60, agent);

        expect(agent.getState(TaskState).autoApprove).toBe(60)
      });

      it('should not allow negative values', () => {
        try {
          taskService.setAutoApprove(-5, agent);
          expect.unreachable('Expected error to be thrown');
        } catch (err) {
          expect(err.message).toBe("Invalid autoApprove value: -5");
        }
      });
    });
  });

  describe('Parallel Tasks Configuration', () => {
    describe('setParallelTasks', () => {
      it('should set parallel tasks count', () => {
        taskService.setParallelTasks(5, agent);

        expect(agent.getState(TaskState).parallelTasks).toBe(5);
      });

      it('should not allow values less than 1', () => {
        try {
          taskService.setParallelTasks(0, agent);
          expect.unreachable('Expected error to be thrown');
        } catch (err) {
          expect(err.message).toBe(`Invalid parallelTasks value: 0`);
        }
      });
    });
  });

  describe('executeTasks', () => {
    it('should return error for non-existent tasks', async () => {
      const results = await taskService.executeTasks(['non-existent-id'], agent);
      expect(results).toEqual(['✗ Task non-existent-id: Not found']);
    });
  });
});