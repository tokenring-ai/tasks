import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import runTasks from './tools/runTasks';
import TaskService from './TaskService';
import Agent from '@tokenring-ai/agent/Agent';


describe('runTasks Tool', () => {
  let app: TokenRingApp;
  let agent: Agent;
  let taskService: TaskService;

  beforeEach(() => {
    app = createTestingApp();
    taskService = new TaskService();

    app.addServices(taskService);

    agent = createTestingAgent(app);
    taskService.attach(agent);


    vi.spyOn(taskService, 'executeTasks').mockResolvedValue(['executed!']);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Metadata', () => {
    it('should have correct tool definition', () => {
      expect(runTasks.name).toBe('tasks_run');
      expect(runTasks.description).toContain('Create and present a complete task plan to the user for approval');
      expect(runTasks.inputSchema).toBeDefined();
      expect(runTasks.requiredContextHandlers).toEqual(["available-agents"]);
    });
  });

  describe('execute', () => {
    const validTasks = [
      {
        taskName: 'Process Data',
        agentType: 'data-processor',
        message: 'Process the uploaded CSV file and generate insights',
        context: 'The CSV file contains sales data. You need to analyze trends and create visualizations.',
      }, {
        taskName: 'Send Email',
        agentType: 'email-sender',
        message: 'Send a confirmation email to the customer',
        context: 'Email template should include order details and tracking information.',
      }
    ];

    it('should execute tasks successfully with user approval', async () => {
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);
      vi.spyOn(taskService, 'executeTasks').mockResolvedValue(['✓ Process Data: Completed', '✓ Send Email: Completed']);
      vi.spyOn(agent, 'chatOutput');
      vi.spyOn(taskService, 'addTask');
      agent.headless = false;
      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(agent.chatOutput).toHaveBeenCalledWith('The following task plan has been generated:');
      expect(agent.chatOutput).toHaveBeenCalledWith(expect.stringContaining('Process Data'));
      expect(agent.chatOutput).toHaveBeenCalledWith(expect.stringContaining('Send Email'));
      
      expect(agent.askHuman).toHaveBeenCalledWith({
        type: 'askForConfirmation',
        message: expect.stringContaining('Task Plan:'),
        default: true,
        timeout: 5,
      });

      expect(taskService.addTask).toHaveBeenCalledTimes(2);
      expect(taskService.executeTasks).toHaveBeenCalledWith(
        [expect.stringContaining("-"), expect.stringContaining("-")], agent
      );

      expect(result).toContain('Task plan executed:');
      expect(result).toContain('Process Data: Completed');
      expect(result).toContain('Send Email: Completed');
    });

    it('should handle auto-approve timeout', async () => {
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);
      agent.headless = false;
      vi.spyOn(taskService,'getAutoApprove').mockReturnValue(30);

      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(agent.askHuman).toHaveBeenCalledWith({
        type: 'askForConfirmation',
        message: expect.stringContaining('Task Plan:'),
        default: true,
        timeout: 30,
      });
    });

    it('should handle user rejection', async () => {
      vi.spyOn(agent, 'askHuman').mockResolvedValueOnce(false);
      vi.spyOn(agent, 'askHuman').mockResolvedValueOnce("User rejected the plan");
      agent.headless = false;

      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(result).toBe('Task plan rejected. Reason: User rejected the plan');
    });

    it('should reject empty tasks array', async () => {
      await expect(runTasks.execute({ tasks: [] }, agent)).rejects.toThrow('Missing task plan');
    });

    it('should handle missing tasks parameter', async () => {
      await expect(runTasks.execute({ tasks: [] } as any, agent)).rejects.toThrow('Missing task plan');
    });

    it('should format task plan correctly', async () => {
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);
      agent.headless = false;
      const singleTask = [
        {
          taskName: 'Test Task',
          agentType: 'test-agent',
          message: 'Test message',
          context: 'Test context',
        },
      ];

      await runTasks.execute({ tasks: singleTask }, agent);

      expect(agent.askHuman).toHaveBeenCalledWith({
        type: 'askForConfirmation',
        message: expect.stringContaining('1. Test Task (test-agent)'),
        default: true,
        timeout: 5,
      });
    });

    it('should preserve task context information', async () => {
      vi.spyOn(taskService, 'addTask');
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);
      agent.headless = false;
      const tasksWithContext = [
        {
          taskName: 'Complex Task',
          agentType: 'complex-agent',
          message: 'Handle complex business logic',
          context: 'Step 1: Parse input data\nStep 2: Apply transformation\nStep 3: Return formatted result',
        },
      ];

      await runTasks.execute({ tasks: tasksWithContext }, agent);

      expect(taskService.addTask).toHaveBeenCalledWith({
        name: 'Complex Task',
        agentType: 'complex-agent',
        message: 'Handle complex business logic',
        context: 'Step 1: Parse input data\nStep 2: Apply transformation\nStep 3: Return formatted result',
      }, agent);
    });

    it('should handle multiple tasks with different agents', async () => {
      const mixedTasks = [
        {
          taskName: 'Data Processing',
          agentType: 'data-processor',
          message: 'Process data',
          context: 'Context 1',
        },
        {
          taskName: 'Email Sending',
          agentType: 'email-agent',
          message: 'Send email',
          context: 'Context 2',
        },
        {
          taskName: 'Report Generation',
          agentType: 'report-agent',
          message: 'Generate report',
          context: 'Context 3',
        },
      ];

      vi.spyOn(taskService, 'addTask');
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);
      agent.headless = false;

      await runTasks.execute({ tasks: mixedTasks }, agent);

      expect(taskService.addTask).toHaveBeenCalledTimes(3);
      expect(taskService.executeTasks).toHaveBeenCalledWith([
        expect.stringContaining("-"), expect.stringContaining("-"), expect.stringContaining("-")
      ], agent);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tasks parameter', async () => {
      const invalidParams = {} as any;

      await expect(runTasks.execute(invalidParams, agent)).rejects.toThrow('[tasks_run] Missing task plan');
    });

    it('should handle null tasks', async () => {
      const invalidParams = { tasks: null } as any;

      await expect(runTasks.execute(invalidParams, agent)).rejects.toThrow();
    });
  });

  describe('User Interaction', () => {
    it('should present clear task plan to user', async () => {
      const tasks = [
        {
          taskName: 'Download File',
          agentType: 'downloader',
          message: 'Download the latest release from GitHub',
          context: 'URL: https://github.com/example/repo/releases/latest',
        },
      ];

      vi.spyOn(agent, 'chatOutput');
      agent.headless = false;
      vi.spyOn(agent, 'askHuman').mockResolvedValue(true);

      await runTasks.execute({ tasks }, agent);

      expect(agent.chatOutput).toHaveBeenCalledWith('The following task plan has been generated:');
      expect(agent.chatOutput).toHaveBeenCalledWith('- Download File');
    });

    it('should handle human input for rejection reason', async () => {
      vi.spyOn(agent, 'askHuman').mockResolvedValueOnce(false);
      vi.spyOn(agent, 'askHuman').mockResolvedValueOnce('The plan is not clear enough');
      agent.headless = false;


      await runTasks.execute({ tasks: [{
        taskName: 'Download File',
        agentType: 'downloader',
        message: 'Download the latest release from GitHub',
        context: 'URL: https://github.com/example/repo/releases/latest',
        }
      ] }, agent);

      expect(agent.askHuman).toHaveBeenCalledWith({
        type: 'askForText',
        message: 'Please explain why you are rejecting this task plan:',
      });
    });
  });
});