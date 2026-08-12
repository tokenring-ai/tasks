import deleteTask from "./tools/deleteTask.ts";
import listTaskLists from "./tools/listTaskLists.ts";
import listTasks from "./tools/listTasks.ts";
import readTask from "./tools/readTask.ts";
import runTask from "./tools/runTask.ts";
import runTaskGroup from "./tools/runTaskGroup.ts";
import searchTasks from "./tools/searchTasks.ts";
import setTaskStatus from "./tools/setTaskStatus.ts";
import taskRunStatus from "./tools/taskRunStatus.ts";
import writeTask from "./tools/writeTask.ts";

export default [listTaskLists, listTasks, readTask, writeTask, setTaskStatus, deleteTask, searchTasks, runTask, runTaskGroup, taskRunStatus];
