import Agent from "@tokenring-ai/agent/Agent";
import {IterableItem, IterableProvider, IterableSpec} from "@tokenring-ai/iterables";
import TaskService from "./TaskService.ts";

export default class TasksIterableProvider implements IterableProvider {
  type = "tasks";
  description = "Iterate over tasks in the task list";
  
  getArgsConfig() {
    return {
      options: {
        status: {type: 'string' as const},
        agentType: {type: 'string' as const}
      }
    };
  }
  
  async* generate(spec: IterableSpec, agent: Agent): AsyncGenerator<IterableItem> {
    const taskService = agent.requireServiceByType(TaskService);
    let tasks = taskService.getTasks(agent);
    
    if (spec.status) {
      tasks = tasks.filter(t => t.status === spec.status);
    }
    if (spec.agentType) {
      tasks = tasks.filter(t => t.agentType === spec.agentType);
    }
    
    for (const task of tasks) {
      yield {
        value: task,
        variables: {
          task,
          id: task.id,
          name: task.name,
          agentType: task.agentType,
          status: task.status,
          message: task.message,
          context: task.context,
          result: task.result
        }
      };
    }
  }
}
