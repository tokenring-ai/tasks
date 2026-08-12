import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { TaskServiceConfigSchema } from "../schema.ts";
import TaskService from "../TaskService.ts";
import { installFakeAgentManager } from "../test/fakeAgent.test.ts";
import tasksCancel from "./tasks/cancel.ts";
import tasksCreateList from "./tasks/createList.ts";
import tasksDelete from "./tasks/delete.ts";
import tasksDeleteList from "./tasks/deleteList.ts";
import tasksDir from "./tasks/dir.ts";
import tasksList from "./tasks/list.ts";
import tasksLists from "./tasks/lists.ts";
import tasksMove from "./tasks/move.ts";
import tasksRun from "./tasks/run.ts";
import tasksRunGroup from "./tasks/runGroup.ts";
import tasksRuns from "./tasks/runs.ts";
import tasksSearch from "./tasks/search.ts";
import tasksShow from "./tasks/show.ts";
import tasksStatus from "./tasks/status.ts";
import tasksWrite from "./tasks/write.ts";

let app: TokenRingApp;
let service: TaskService;
let taskDir: string;
let mockAgent: any;

beforeEach(async () => {
  taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-tasks-cmd-"));
  app = createTestingApp();
  installFakeAgentManager(app);
  service = new TaskService(app);
  app.addService(service);
  service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir }));

  mockAgent = {
    requireService: () => service,
    getAbortSignal: () => new AbortController().signal,
  };
});

afterEach(async () => {
  await fs.rm(taskDir, { recursive: true, force: true });
});

/** Commands are plain objects, so they can be invoked directly with a stubbed agent. */
const run = (command: any, input: Record<string, unknown> = {}): Promise<string> =>
  command.execute({ args: {}, remainder: "", agent: mockAgent, ...input }) as Promise<string>;

describe("command metadata", () => {
  const allCommands = [
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

  it("namespaces every command under /tasks", () => {
    for (const command of allCommands) {
      expect(command.name.startsWith("tasks ")).toBe(true);
    }
  });

  it("gives every command a description and help text", () => {
    for (const command of allCommands) {
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.help.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate command names", () => {
    const names = allCommands.map(command => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("no longer exposes the removed in-memory commands", () => {
    const names = allCommands.map(command => command.name);
    expect(names).not.toContain("tasks add");
    expect(names).not.toContain("tasks execute");
    expect(names).not.toContain("tasks clear");
    expect(names).not.toContain("tasks settings");
  });
});

describe("/tasks write", () => {
  it("creates a task from a path and body", async () => {
    const output = await run(tasksWrite, { args: { path: "refactor/one", agent: "code" }, remainder: "Extract the parser" });

    expect(output).toContain("refactor/one");
    const task = await service.getTask("refactor", "one");
    expect(task!.body).toBe("Extract the parser");
    expect(task!.agentType).toBe("code");
  });

  it("applies optional status, priority and title", async () => {
    await run(tasksWrite, { args: { path: "refactor/one", status: "blocked", priority: "high", title: "A title" }, remainder: "body" });

    const task = await service.getTask("refactor", "one");
    expect(task!.status).toBe("blocked");
    expect(task!.priority).toBe("high");
    expect(task!.title).toBe("A title");
  });

  it("rejects a path that is not list/name", async () => {
    await expect(run(tasksWrite, { args: { path: "nolist" }, remainder: "body" })).rejects.toThrow(/list\/name/);
    await expect(run(tasksWrite, { args: { path: "a/b/c" }, remainder: "body" })).rejects.toThrow(/list\/name/);
  });

  it("overwrites an existing task", async () => {
    await run(tasksWrite, { args: { path: "refactor/one" }, remainder: "first" });
    await run(tasksWrite, { args: { path: "refactor/one" }, remainder: "second" });

    expect((await service.getTask("refactor", "one"))!.body).toBe("second");
  });
});

describe("/tasks lists and /tasks list", () => {
  beforeEach(async () => {
    await service.updateTask("refactor", "alpha", { body: "a", status: "pending", tags: ["backend"] });
    await service.updateTask("refactor", "beta", { body: "b", status: "done" });
    await service.updateTask("docs", "gamma", { body: "c", status: "pending" });
  });

  it("reports every list with its counts", async () => {
    const output = await run(tasksLists);
    expect(output).toContain("refactor");
    expect(output).toContain("docs");
  });

  it("says so when there are no lists at all", async () => {
    await service.deleteTaskList("refactor");
    await service.deleteTaskList("docs");
    expect(await run(tasksLists)).toContain("No task lists yet");
  });

  it("lists tasks across every list when no list is given", async () => {
    const output = await run(tasksList, { args: {} });
    expect(output).toContain("refactor/alpha");
    expect(output).toContain("docs/gamma");
  });

  it("restricts to one list", async () => {
    const output = await run(tasksList, { args: { list: "docs" } });
    expect(output).toContain("docs/gamma");
    expect(output).not.toContain("refactor/alpha");
  });

  it("filters by status and tag", async () => {
    expect(await run(tasksList, { args: { list: "refactor", status: "done" } })).toContain("refactor/beta");
    expect(await run(tasksList, { args: { list: "refactor", status: "done" } })).not.toContain("refactor/alpha");
    expect(await run(tasksList, { args: { tag: "backend" } })).toContain("refactor/alpha");
  });

  it("reports an empty result rather than an empty table", async () => {
    expect(await run(tasksList, { args: { list: "refactor", status: "cancelled" } })).toContain("No tasks found");
  });
});

describe("/tasks show", () => {
  it("renders metadata, instructions and steps", async () => {
    await service.createTask("refactor", "one", { body: "the instructions", agentType: "code", title: "A title", steps: ["first", "second"], tags: ["x"] });

    const output = await run(tasksShow, { args: { path: "refactor/one" } });

    expect(output).toContain("A title");
    expect(output).toContain("refactor/one");
    expect(output).toContain("code");
    expect(output).toContain("the instructions");
    expect(output).toContain("1. first");
    expect(output).toContain("2. second");
  });

  it("reports a missing task plainly", async () => {
    expect(await run(tasksShow, { args: { path: "refactor/missing" } })).toContain("not found");
  });
});

describe("/tasks status", () => {
  it("changes the status", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    const output = await run(tasksStatus, { args: { path: "refactor/one", status: "done" } });

    expect(output).toContain("now done");
    expect((await service.getTask("refactor", "one"))!.status).toBe("done");
  });

  it("rejects an unknown status without touching the task", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    const output = await run(tasksStatus, { args: { path: "refactor/one", status: "nonsense" } });

    expect(output).toContain("Invalid status");
    expect((await service.getTask("refactor", "one"))!.status).toBe("pending");
  });
});

describe("/tasks delete, move, create-list, delete-list", () => {
  it("deletes a task and reports a missing one", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    expect(await run(tasksDelete, { args: { path: "refactor/one" } })).toContain("Deleted");
    expect(await run(tasksDelete, { args: { path: "refactor/one" } })).toContain("not found");
  });

  it("moves a task between lists", async () => {
    await service.createTask("inbox", "one", { body: "a" });
    const output = await run(tasksMove, { args: { from: "inbox/one", to: "refactor/two" } });

    expect(output).toContain("refactor/two");
    expect(await service.getTask("inbox", "one")).toBeNull();
    expect(await service.getTask("refactor", "two")).not.toBeNull();
  });

  it("creates and deletes a list", async () => {
    expect(await run(tasksCreateList, { args: { list: "refactor" } })).toContain("refactor");
    await service.createTask("refactor", "one", { body: "a" });

    const output = await run(tasksDeleteList, { args: { list: "refactor" } });
    expect(output).toContain("1 task");
    expect(await service.listTaskLists()).toEqual([]);
  });

  it("reports deleting a list that does not exist", async () => {
    expect(await run(tasksDeleteList, { args: { list: "nope" } })).toContain("not found");
  });
});

describe("/tasks search", () => {
  it("finds tasks and shows the matching lines", async () => {
    await service.createTask("refactor", "parser", { body: "nothing", title: "Extract the parser" });
    await service.createTask("refactor", "other", { body: "mentions parser here" });

    const output = await run(tasksSearch, { args: { limit: 10 }, remainder: "parser" });

    expect(output).toContain("refactor/parser");
    expect(output).toContain("refactor/other");
    expect(output).toContain("mentions parser here");
  });

  it("reports no matches plainly", async () => {
    expect(await run(tasksSearch, { args: { limit: 10 }, remainder: "nothing-matches-this" })).toContain("No tasks matched");
  });
});

describe("/tasks run and run-group", () => {
  it("runs a single task and reports its result with --wait", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    const output = await run(tasksRun, { args: { path: "refactor/one", wait: true } });

    expect(output).toContain("completed");
  });

  it("runs every pending task in a list with --wait", async () => {
    await service.createTask("batch", "one", { body: "a", agentType: "code" });
    await service.createTask("batch", "two", { body: "b", agentType: "code" });

    const output = await run(tasksRunGroup, { args: { list: "batch", status: "pending", wait: true, parallel: 2 } });

    expect(output).toContain("2 of 2 tasks completed");
  });

  it("runs only the named tasks", async () => {
    await service.createTask("batch", "one", { body: "a", agentType: "code" });
    await service.createTask("batch", "two", { body: "b", agentType: "code" });

    const output = await run(tasksRunGroup, { args: { list: "batch", status: "pending", names: "one", wait: true } });

    expect(output).toContain("1 of 1 tasks completed");
    expect(output).toContain("batch/one");
    expect(output).not.toContain("batch/two");
  });

  it("says so when nothing matches the requested status", async () => {
    await service.updateTask("batch", "one", { body: "a", agentType: "code", status: "done" });
    const output = await run(tasksRunGroup, { args: { list: "batch", status: "pending", wait: true } });

    expect(output).toContain("No pending tasks");
  });
});

describe("/tasks runs and cancel", () => {
  it("reports that nothing has run yet", async () => {
    expect(await run(tasksRuns, { args: { limit: 20 } })).toContain("No task runs recorded yet");
  });

  it("shows a completed run", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    await service.runTask({ list: "refactor", name: "one" });

    const output = await run(tasksRuns, { args: { limit: 20 } });
    expect(output).toContain("refactor/one");
    expect(output).toContain("completed");
  });

  it("asks for an id when given neither a run nor a batch", async () => {
    expect(await run(tasksCancel, { args: {} })).toContain("Pass a run id");
  });

  it("reports an unknown run id", async () => {
    expect(await run(tasksCancel, { args: { runId: "nope" } })).toContain("not found");
  });

  it("reports a run that has already finished", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    const outcome = await service.runTask({ list: "refactor", name: "one" });

    // Accepts the shortened id shown by /tasks runs.
    const output = await run(tasksCancel, { args: { runId: outcome.runId.slice(0, 8) } });
    expect(output).toContain("already finished");
  });
});

describe("/tasks dir", () => {
  it("reports the resolved directory and configured defaults", async () => {
    const output = await run(tasksDir);
    expect(output).toContain(taskDir);
    expect(output).toContain("Default agent type");
    expect(output).toContain("Parallelism");
  });
});
