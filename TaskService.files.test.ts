import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { TaskServiceConfigSchema } from "./schema.ts";
import TaskService, { TaskConflictError } from "./TaskService.ts";

let app: TokenRingApp;
let service: TaskService;
let taskDir: string;

function configure(overrides: Record<string, unknown> = {}): void {
  service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir, ...overrides }));
}

beforeEach(async () => {
  taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-tasks-"));
  app = createTestingApp();
  service = new TaskService(app);
  configure();
});

afterEach(async () => {
  await fs.rm(taskDir, { recursive: true, force: true });
});

describe("task directory resolution", () => {
  it("resolves an absolute task directory as given", () => {
    expect(service.getTaskDirectory()).toBe(taskDir);
  });

  it("resolves a relative task directory against the workspace", () => {
    service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: "tasks" }));
    expect(service.getTaskDirectory()).toBe(path.resolve("/tmp", "tasks"));
  });
});

describe("task lists", () => {
  it("treats a missing task directory as empty rather than an error", async () => {
    service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: path.join(taskDir, "does-not-exist") }));
    expect(await service.listTaskLists()).toEqual([]);
  });

  it("creates a list and reports it with zeroed status counts", async () => {
    const list = await service.createTaskList("refactor");
    expect(list.name).toBe("refactor");
    expect(list.taskCount).toBe(0);
    expect(list.statusCounts.pending).toBe(0);

    expect((await service.listTaskLists()).map(entry => entry.name)).toEqual(["refactor"]);
  });

  it("refuses to create a list that already exists", async () => {
    await service.createTaskList("refactor");
    await expect(service.createTaskList("refactor")).rejects.toThrow(/already exists/);
  });

  it("counts tasks by status", async () => {
    await service.updateTask("refactor", "one", { body: "a", status: "pending" });
    await service.updateTask("refactor", "two", { body: "b", status: "done" });
    await service.updateTask("refactor", "three", { body: "c", status: "done" });

    const [list] = await service.listTaskLists();
    expect(list!.taskCount).toBe(3);
    expect(list!.statusCounts.done).toBe(2);
    expect(list!.statusCounts.pending).toBe(1);
  });

  it("skips dotfiles and directories with unusable names", async () => {
    await fs.mkdir(path.join(taskDir, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(taskDir, "has spaces"), { recursive: true });
    await service.createTaskList("valid");

    expect((await service.listTaskLists()).map(entry => entry.name)).toEqual(["valid"]);
  });

  it("deletes a list and everything in it", async () => {
    await service.updateTask("refactor", "one", { body: "a" });
    expect(await service.deleteTaskList("refactor")).toBe(true);
    expect(await service.listTaskLists()).toEqual([]);
    expect(await service.deleteTaskList("refactor")).toBe(false);
  });
});

describe("task CRUD", () => {
  it("writes a task to <dir>/<list>/<name>.md with frontmatter", async () => {
    await service.createTask("refactor", "extract-parser", { body: "Extract the parser", agentType: "code", title: "Extract parser" });

    const raw = await fs.readFile(path.join(taskDir, "refactor", "extract-parser.md"), "utf-8");
    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain("agentType: code");
    expect(raw).toContain("status: pending");
    expect(raw).toContain("Extract the parser");
  });

  it("refuses to create a task that already exists", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    await expect(service.createTask("refactor", "one", { body: "b" })).rejects.toThrow(/already exists/);
  });

  it("rejects names that would escape the task directory", async () => {
    await expect(service.createTask("refactor", "../escape", { body: "a" })).rejects.toThrow(/Invalid task name/);
    await expect(service.createTask("refactor", "foo/bar", { body: "a" })).rejects.toThrow(/Invalid task name/);
    await expect(service.createTask("../escape", "one", { body: "a" })).rejects.toThrow(/Invalid list name/);
  });

  it("returns null for a task that does not exist", async () => {
    expect(await service.getTask("refactor", "nope")).toBeNull();
  });

  it("parses a hand-written file with no frontmatter at all", async () => {
    await fs.mkdir(path.join(taskDir, "manual"), { recursive: true });
    await fs.writeFile(path.join(taskDir, "manual", "note.md"), "Just do the thing\n", "utf-8");

    const task = await service.getTask("manual", "note");
    expect(task).not.toBeNull();
    expect(task!.status).toBe("pending");
    expect(task!.priority).toBe("normal");
    expect(task!.body).toBe("Just do the thing");
  });

  it("preserves createdAt and run bookkeeping across an update", async () => {
    const created = await service.createTask("refactor", "one", { body: "first" });
    const createdAt = created.frontmatter.createdAt;
    expect(createdAt).not.toBe("");

    const updated = await service.updateTask("refactor", "one", { body: "second", title: "Renamed" });
    expect(updated.frontmatter.createdAt).toBe(createdAt);
    expect(updated.title).toBe("Renamed");
    expect(updated.body).toBe("second");
  });

  it("preserves unknown frontmatter keys written by hand", async () => {
    await fs.mkdir(path.join(taskDir, "manual"), { recursive: true });
    await fs.writeFile(path.join(taskDir, "manual", "note.md"), "---\ntitle: Hello\njira: ABC-123\n---\n\nBody\n", "utf-8");

    await service.setTaskStatus("manual", "note", "done");

    const raw = await fs.readFile(path.join(taskDir, "manual", "note.md"), "utf-8");
    expect(raw).toContain("jira: ABC-123");
    expect(raw).toContain("status: done");
  });

  it("changes status without disturbing the body", async () => {
    await service.createTask("refactor", "one", { body: "the instructions" });
    const updated = await service.setTaskStatus("refactor", "one", "blocked");

    expect(updated.status).toBe("blocked");
    expect(updated.body).toBe("the instructions");
  });

  it("deletes a task and reports whether anything was removed", async () => {
    await service.createTask("refactor", "one", { body: "a" });
    expect(await service.deleteTask("refactor", "one")).toBe(true);
    expect(await service.deleteTask("refactor", "one")).toBe(false);
  });

  it("moves a task between lists, keeping its content", async () => {
    await service.createTask("inbox", "one", { body: "the work", agentType: "code" });
    const moved = await service.moveTask("inbox", "one", "refactor", "renamed");

    expect(moved.list).toBe("refactor");
    expect(moved.name).toBe("renamed");
    expect(moved.body).toBe("the work");
    expect(moved.agentType).toBe("code");
    expect(await service.getTask("inbox", "one")).toBeNull();
  });

  it("refuses to move onto an existing task", async () => {
    await service.createTask("inbox", "one", { body: "a" });
    await service.createTask("refactor", "one", { body: "b" });

    await expect(service.moveTask("inbox", "one", "refactor", "one")).rejects.toThrow(/already exists/);
    expect(await service.getTask("inbox", "one")).not.toBeNull();
  });

  it("detects a concurrent change when the caller supplies expectedUpdatedAt", async () => {
    const created = await service.createTask("refactor", "one", { body: "a" });
    // The check compares mtime, so the competing write has to land in a later millisecond for
    // there to be anything to detect.
    await delay(5);
    await service.updateTask("refactor", "one", { body: "b" });

    await expect(service.updateTask("refactor", "one", { body: "c" }, { expectedUpdatedAt: created.updatedAt })).rejects.toThrow(TaskConflictError);
  });

  it("allows a matching expectedUpdatedAt through", async () => {
    const created = await service.createTask("refactor", "one", { body: "a" });
    const updated = await service.updateTask("refactor", "one", { body: "b" }, { expectedUpdatedAt: created.updatedAt });
    expect(updated.body).toBe("b");
  });
});

describe("listing and filtering", () => {
  beforeEach(async () => {
    await service.updateTask("refactor", "alpha", { body: "a", status: "pending", tags: ["backend"], agentType: "code" });
    await service.updateTask("refactor", "beta", { body: "b", status: "done", tags: ["frontend"], agentType: "research" });
    await service.updateTask("docs", "gamma", { body: "c", status: "pending", tags: ["backend"] });
  });

  it("sorts tasks by name within a list", async () => {
    expect((await service.listTasks("refactor")).map(task => task.name)).toEqual(["alpha", "beta"]);
  });

  it("filters by status, tag and agent type", async () => {
    expect((await service.listTasks("refactor", { status: "done" })).map(task => task.name)).toEqual(["beta"]);
    expect((await service.listTasks("refactor", { tag: "backend" })).map(task => task.name)).toEqual(["alpha"]);
    expect((await service.listTasks("refactor", { agentType: "research" })).map(task => task.name)).toEqual(["beta"]);
  });

  it("lists across every list, ordered by list then name", async () => {
    const all = await service.listAllTasks();
    expect(all.map(task => `${task.list}/${task.name}`)).toEqual(["docs/gamma", "refactor/alpha", "refactor/beta"]);
  });

  it("returns metadata only, without bodies", async () => {
    const [task] = await service.listTasks("refactor");
    expect(task).not.toHaveProperty("body");
    expect(task).not.toHaveProperty("frontmatter");
    expect(task!.stepCount).toBe(0);
  });

  it("skips a file with unparseable frontmatter without hiding its siblings", async () => {
    await fs.writeFile(path.join(taskDir, "refactor", "broken.md"), "---\n- not: a mapping\n---\n\nBody\n", "utf-8");
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      expect((await service.listTasks("refactor")).map(task => task.name)).toEqual(["alpha", "beta"]);
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("ignores non-markdown files", async () => {
    await fs.writeFile(path.join(taskDir, "refactor", "notes.txt"), "not a task", "utf-8");
    expect((await service.listTasks("refactor")).map(task => task.name)).toEqual(["alpha", "beta"]);
  });
});

describe("search", () => {
  beforeEach(async () => {
    await service.updateTask("refactor", "parser", { body: "Nothing relevant here", title: "Extract the parser" });
    await service.updateTask("refactor", "unrelated", { body: "Mentions parser once in the body" });
    await service.updateTask("docs", "readme", { body: "Totally different subject" });
  });

  it("returns nothing for an empty query", async () => {
    expect(await service.searchTasks("   ")).toEqual([]);
  });

  it("ranks name and title hits above body hits", async () => {
    const matches = await service.searchTasks("parser");
    expect(matches.map(match => match.name)).toEqual(["parser", "unrelated"]);
    expect(matches[0]!.matchType).toBe("name");
    expect(matches[1]!.matchType).toBe("content");
  });

  it("captures the matching lines from the body", async () => {
    const [, contentMatch] = await service.searchTasks("parser");
    expect(contentMatch!.lineMatches).toHaveLength(1);
    expect(contentMatch!.lineMatches[0]!.content).toContain("Mentions parser");
  });

  it("restricts to one list and honours the limit", async () => {
    expect(await service.searchTasks("different", { list: "refactor" })).toEqual([]);
    expect(await service.searchTasks("parser", { limit: 1 })).toHaveLength(1);
  });

  it("matches case-insensitively across several terms", async () => {
    const matches = await service.searchTasks(["PARSER", "different"]);
    expect(matches.map(match => match.name).sort()).toEqual(["parser", "readme", "unrelated"]);
  });
});
