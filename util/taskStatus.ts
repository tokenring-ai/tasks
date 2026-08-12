import type { TaskRunStatus, TaskStatus } from "../schema.ts";

/**
 * Decides what a run's outcome should do to the task's durable board status.
 *
 * The two lifetimes are deliberately kept apart: a run status describes one execution and lives
 * in app state, while `status` describes the work item and lives in the file. A run status is
 * never written into the file directly — it always passes through here.
 *
 * `runOwnsInProgress` is true only when this very run is the one that moved the task to
 * `in-progress`. Without it, a run finishing would happily overwrite a status that a user (or a
 * second run) set in the meantime.
 *
 * @returns the new task status, or null to leave the file's status untouched.
 */
export function mapRunStatusToTaskStatus(runStatus: TaskRunStatus, currentStatus: TaskStatus, runOwnsInProgress: boolean): TaskStatus | null {
  if (runStatus === "starting") {
    // Re-running a task that is already done or cancelled must not silently reopen it, and a task
    // already in-progress belongs to whichever run claimed it first.
    return currentStatus === "pending" || currentStatus === "blocked" ? "in-progress" : null;
  }

  if (runStatus === "running") return null;

  if (currentStatus !== "in-progress" || !runOwnsInProgress) return null;

  switch (runStatus) {
    case "completed":
      return "done";
    case "failed":
      return "blocked";
    case "cancelled":
      return "pending";
  }
}
