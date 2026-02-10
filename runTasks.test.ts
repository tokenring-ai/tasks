import Agent from '@tokenring-ai/agent/Agent';
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent";
import TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp";
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TaskState} from "./state/taskState";
import TaskService from './TaskService';
import runTasks from './tools/runTasks';

describe('runTasks Tool', () => {
  let app: TokenRingApp;
  let agent: Agent;
  let taskService: TaskService;

  beforeEach(() => {
    app = createTestingApp();
    taskService = new TaskService({
      agentDefaults: {
        autoApprove: 5,
        parallel: 1
      }
    });

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
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);
      vi.spyOn(taskService, 'executeTasks').mockResolvedValue(['✓ Process Data: Completed', '✓ Send Email: Completed']);
      vi.spyOn(agent, 'chatOutput');
      vi.spyOn(taskService, 'addTask');
      agent.config.headless = false;
      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(agent.chatOutput).toHaveBeenCalledWith('The following task plan has been generated:');
      expect(agent.chatOutput).toHaveBeenCalledWith(expect.stringContaining('Process Data'));
      expect(agent.chatOutput).toHaveBeenCalledWith(expect.stringContaining('Send Email'));
      
      expect(agent.askQuestion).toHaveBeenCalledWith({
        "question": {
          "defaultValue": [
            "Approved",
          ],
          "label": "Approve ?",
          "maximumSelections": 1,
          "minimumSelections": 1,
          "tree": [
            {
              "name": "Yes",
              "value": "Approved",
            },
            {
              "name": "No",
              "value": "Not approved",
            },
          ],
          "type": "treeSelect",
        },
        message: expect.stringContaining('Task Plan:'),
        autoSubmitAfter: 5,

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
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);
      agent.config.headless = false;
      agent.mutateState(TaskState, state => {
        state.autoApprove = 30;
      });

      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(agent.askQuestion).toHaveBeenCalledWith({
        "autoSubmitAfter": 30,
        "question": {
          "defaultValue": [
            "Approved",
          ],
          "label": "Approve ?",
          "maximumSelections": 1,
          "minimumSelections": 1,
          "tree": [
            {
              "name": "Yes",
              "value": "Approved",
            },
            {
              "name": "No",
              "value": "Not approved",
            },
          ],
          "type": "treeSelect",
        },
        message: expect.stringContaining('Task Plan:'),
      });
    });

    it('should handle user rejection', async () => {
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(["Not approved"]);
      agent.config.headless = false;

      const result = await runTasks.execute({ tasks: validTasks }, agent);

      expect(result).toBe('Task plan rejected. Reason: Not approved');
    });

    it('should format task plan correctly', async () => {
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);
      agent.config.headless = false;
      const singleTask = [
        {
          taskName: 'Test Task',
          agentType: 'test-agent',
          message: 'Test message',
          context: 'Test context',
        },
      ];

      await runTasks.execute({ tasks: singleTask }, agent);

      expect(agent.askQuestion).toHaveBeenCalledWith({
        "autoSubmitAfter": 5,
        "question": {
          "defaultValue": [
            "Approved",
          ],
          "label": "Approve ?",
          "maximumSelections": 1,
          "minimumSelections": 1,
          "tree": [
            {
              "name": "Yes",
              "value": "Approved",
            },
            {
              "name": "No",
              "value": "Not approved",
            },
          ],
          "type": "treeSelect",
        },
        message: expect.stringContaining('1. Test Task (test-agent)'),
      });
    });

    it('should preserve task context information', async () => {
      vi.spyOn(taskService, 'addTask');
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);
      agent.config.headless = false;
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
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);
      agent.config.headless = false;

      await runTasks.execute({ tasks: mixedTasks }, agent);

      expect(taskService.addTask).toHaveBeenCalledTimes(3);
      expect(taskService.executeTasks).toHaveBeenCalledWith([
        expect.stringContaining("-"), expect.stringContaining("-"), expect.stringContaining("-")
      ], agent);
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
      agent.config.headless = false;
      vi.spyOn(agent, 'askQuestion').mockResolvedValue(['Approved']);

      await runTasks.execute({ tasks }, agent);

      expect(agent.chatOutput).toHaveBeenCalledWith('The following task plan has been generated:');
      expect(agent.chatOutput).toHaveBeenCalledWith('- Download File');
    });

    it('should handle human input for rejection reason', async () => {
      vi.spyOn(agent, 'askQuestion').mockResolvedValueOnce(["Not approved"]);
      vi.spyOn(agent, 'askQuestion').mockResolvedValueOnce('The plan is not clear enough');
      agent.config.headless = false;


      await runTasks.execute({ tasks: [{
        taskName: 'Download File',
        agentType: 'downloader',
        message: 'Download the latest release from GitHub',
        context: 'URL: https://github.com/example/repo/releases/latest',
        }
      ] }, agent);

      expect(agent.askQuestion).toHaveBeenCalledWith({
        "question": {
          "label": "Reason:",
          "masked": undefined,
          "type": "text",
        },
        message: 'Please explain why you are rejecting this task plan:',
      });
    });
  });
});