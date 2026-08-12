import tasksCancel from "./commands/tasks/cancel.ts";
import tasksCreateList from "./commands/tasks/createList.ts";
import tasksDelete from "./commands/tasks/delete.ts";
import tasksDeleteList from "./commands/tasks/deleteList.ts";
import tasksDir from "./commands/tasks/dir.ts";
import tasksList from "./commands/tasks/list.ts";
import tasksLists from "./commands/tasks/lists.ts";
import tasksMove from "./commands/tasks/move.ts";
import tasksRun from "./commands/tasks/run.ts";
import tasksRunGroup from "./commands/tasks/runGroup.ts";
import tasksRuns from "./commands/tasks/runs.ts";
import tasksSearch from "./commands/tasks/search.ts";
import tasksShow from "./commands/tasks/show.ts";
import tasksStatus from "./commands/tasks/status.ts";
import tasksWrite from "./commands/tasks/write.ts";

export default [
  tasksLists,
  tasksList,
  tasksShow,
  tasksWrite,
  tasksStatus,
  tasksDelete,
  tasksMove,
  tasksSearch,
  tasksRun,
  tasksRunGroup,
  tasksRuns,
  tasksCancel,
  tasksCreateList,
  tasksDeleteList,
  tasksDir,
];
