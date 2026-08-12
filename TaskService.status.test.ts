import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { TASK_STATUSES, type TaskRunStatus, TaskRunStatusSchema, TaskServiceConfigSchema, type TaskStatus } from "./schema.ts";
import TaskService from "./TaskService.ts";
import { mapRunStatusToTaskStatus } from "./util/taskStatus.ts";

describe("mapRunStatusToTaskStatus", () => {
  it("claims a task that is free", () => {
    expect(mapRunStatusToTaskStatus("starting", "pending", false)).toBe("in-progress");
    expect(mapRunStatusToTaskStatus("starting", "blocked", false)).toBe("in-progress");
  });

  it("does not reopen a task that is already finished or claimed", () => {
    expect(mapRunStatusToTaskStatus("starting", "done", false)).toBeNull();
    expect(mapRunStatusToTaskStatus("starting", "cancelled", false)).toBeNull();
    expect(mapRunStatusToTaskStatus("starting", "in-progress", false)).toBeNull();
  });

  it("maps a terminal run onto the board status when the run owns the claim", () => {
    expect(mapRunStatusToTaskStatus("completed", "in-progress", true)).toBe("done");
    expect(mapRunStatusToTaskStatus("failed", "in-progress", true)).toBe("blocked");
    expect(mapRunStatusToTaskStatus("cancelled", "in-progress", true)).toBe("pending");
  });

  it("leaves the status alone when the run does not own the claim", () => {
    expect(mapRunStatusToTaskStatus("completed", "in-progress", false)).toBeNull();
    expect(mapRunStatusToTaskStatus("failed", "in-progress", false)).toBeNull();
  });

  it("leaves the status alone when the task moved out of in-progress underneath the run", () => {
    for (const status of ["pending", "blocked", "done", "cancelled"] as const) {
      expect(mapRunStatusToTaskStatus("completed", status, true)).toBeNull();
    }
  });

  it("never reacts to the running status", () => {
    for (const status of TASK_STATUSES) {
      expect(mapRunStatusToTaskStatus("running", status, true)).toBeNull();
    }
  });

  it("only ever returns a valid task status", () => {
    for (const runStatus of TaskRunStatusSchema.options as TaskRunStatus[]) {
      for (const taskStatus of TASK_STATUSES as readonly TaskStatus[]) {
        for (const owns of [true, false]) {
          const result = mapRunStatusToTaskStatus(runStatus, taskStatus, owns);
          if (result !== null) expect(TASK_STATUSES).toContain(result);
        }
      }
    }
  });
});

describe("frontmatter write-back", () => {
  let app: TokenRingApp;
  let service: TaskService;
  let taskDir: string;

  beforeEach(async () => {
    taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-tasks-status-"));
    app = createTestingApp();
    service = new TaskService(app);
    service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir }));
  });

  afterEach(async () => {
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  /** patchFrontmatter is private, but it is the whole point of the write-back design. */
  const patch = (list: string, name: string, values: Record<string, unknown>) => (service as any).patchFrontmatter(list, name, values) as Promise<void>;

  it("preserves a body edited between the read and the write", async () => {
    await service.createTask("refactor", "one", { body: "original" });

    // Somebody edits the instructions while a run is in flight.
    await service.updateTask("refactor", "one", { body: "edited by the user" });
    await patch("refactor", "one", { status: "done", lastResult: "all good" });

    const task = await service.getTask("refactor", "one");
    expect(task!.body).toBe("edited by the user");
    expect(task!.status).toBe("done");
    expect(task!.lastResult).toBe("all good");
  });

  it("keeps unknown frontmatter keys through a write-back", async () => {
    await fs.mkdir(path.join(taskDir, "refactor"), { recursive: true });
    await fs.writeFile(path.join(taskDir, "refactor", "one.md"), "---\ntitle: Hello\njira: ABC-123\n---\n\nBody\n", "utf-8");

    await patch("refactor", "one", { status: "done" });

    expect(await fs.readFile(path.join(taskDir, "refactor", "one.md"), "utf-8")).toContain("jira: ABC-123");
  });

  it("writes nothing at all when writeBackStatus is disabled", async () => {
    service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir, writeBackStatus: false }));
    await service.createTask("refactor", "one", { body: "original" });
    const before = await fs.readFile(path.join(taskDir, "refactor", "one.md"), "utf-8");

    await patch("refactor", "one", { status: "done", lastResult: "all good" });

    expect(await fs.readFile(path.join(taskDir, "refactor", "one.md"), "utf-8")).toBe(before);
  });

  it("ignores a patch aimed at a task that no longer exists", async () => {
    await expect(patch("refactor", "missing", { status: "done" })).resolves.toBeUndefined();
  });

  it("keeps the frontmatter key order stable across repeated writes", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    const first = await fs.readFile(path.join(taskDir, "refactor", "one.md"), "utf-8");

    await patch("refactor", "one", { lastRunStatus: "completed" });
    await patch("refactor", "one", { lastRunStatus: "completed" });
    const second = await fs.readFile(path.join(taskDir, "refactor", "one.md"), "utf-8");

    const keysOf = (raw: string) =>
      raw
        .split("---")[1]!
        .trim()
        .split("\n")
        .filter(line => /^\w+:/.test(line))
        .map(line => line.split(":")[0]);

    expect(keysOf(second)).toEqual(keysOf(first));
  });
});

describe("reconcileStaleTasks", () => {
  let app: TokenRingApp;
  let service: TaskService;
  let taskDir: string;

  beforeEach(async () => {
    taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-tasks-reconcile-"));
    app = createTestingApp();
    service = new TaskService(app);
    service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir }));
  });

  afterEach(async () => {
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  it("returns a task stranded at in-progress by a crash to pending", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    await (service as any).patchFrontmatter("refactor", "one", { status: "in-progress", lastRunId: "run-that-no-longer-exists" });

    await service.start();

    const task = await service.getTask("refactor", "one");
    expect(task!.status).toBe("pending");
    expect(task!.lastRunStatus).toBe("cancelled");
  });

  it("leaves tasks in other statuses untouched", async () => {
    await service.updateTask("refactor", "done-task", { body: "a", status: "done" });
    await service.updateTask("refactor", "pending-task", { body: "b", status: "pending" });

    await service.start();

    expect((await service.getTask("refactor", "done-task"))!.status).toBe("done");
    expect((await service.getTask("refactor", "pending-task"))!.status).toBe("pending");
  });
});
