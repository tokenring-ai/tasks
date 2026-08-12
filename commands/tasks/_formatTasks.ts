import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import type { TaskListSummary, TaskRun, TaskSearchMatch, TaskSummary } from "../../schema.ts";

export function formatTaskLists(lists: TaskListSummary[]): string {
  if (lists.length === 0) return "No task lists yet. Create one with /tasks write <list>/<name> <instructions>";

  return markdownTable(
    ["List", "Tasks", "Pending", "Running", "Blocked", "Done"],
    lists.map(list => [
      list.name,
      String(list.taskCount),
      String(list.statusCounts.pending),
      String(list.statusCounts["in-progress"]),
      String(list.statusCounts.blocked),
      String(list.statusCounts.done),
    ]),
  );
}

export function formatTasks(tasks: TaskSummary[], scope: string): string {
  if (tasks.length === 0) return `No tasks found${scope ? ` in ${scope}` : ""}.`;

  return markdownTable(
    ["Task", "Title", "Status", "Agent", "Priority", "Tags"],
    tasks.map(task => [`${task.list}/${task.name}`, task.title || "—", task.status, task.agentType || "(default)", task.priority, task.tags.join(", ") || "—"]),
  );
}

export function formatTaskMatches(matches: TaskSearchMatch[]): string {
  if (matches.length === 0) return "No tasks matched.";

  const lines: string[] = [];
  for (const match of matches) {
    lines.push(`### ${match.list}/${match.name} (${match.status}, matched on ${match.matchType})`);
    if (match.title) lines.push(match.title);
    for (const lineMatch of match.lineMatches) {
      lines.push(`  ${lineMatch.line}: ${lineMatch.content.trim()}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function formatRuns(runs: TaskRun[]): string {
  if (runs.length === 0) return "No task runs recorded yet.";

  return markdownTable(
    ["Run", "Task", "Status", "Step", "Agent", "Result"],
    runs.map(run => [
      run.id.slice(0, 8),
      `${run.list}/${run.name}`,
      run.status,
      run.messages.length > 1 ? `${Math.min(run.currentStep + 1, run.messages.length)}/${run.messages.length}` : "—",
      run.agentId ? run.agentId.slice(0, 8) : "—",
      run.message ? run.message.split("\n")[0]!.slice(0, 60) : "—",
    ]),
  );
}
