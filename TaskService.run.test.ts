import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { TaskServiceConfigSchema } from "./schema.ts";
import TaskService from "./TaskService.ts";
import { type FakeAgentManager, installFakeAgentManager } from "./test/fakeAgent.test.ts";

let app: TokenRingApp;
let service: TaskService;
let fake: FakeAgentManager;
let taskDir: string;

function configure(overrides: Record<string, unknown> = {}): void {
  service.reconfigure(TaskServiceConfigSchema.parse({ taskDirectory: taskDir, ...overrides }));
}

/**
 * Agents are spawned a few microtasks into a run, so tests that need to reach into an agent
 * (to set a responder, or slow it down) have to wait for it to exist first.
 */
async function waitForSpawn(count: number, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (fake.spawned.length < count) {
    if (Date.now() > deadline) throw new Error(`Only ${fake.spawned.length} of ${count} agents spawned within ${timeoutMs}ms`);
    await delay(1);
  }
}

beforeEach(async () => {
  taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-tasks-run-"));
  app = createTestingApp();
  fake = installFakeAgentManager(app);
  service = new TaskService(app);
  app.addService(service);
  configure();
});

afterEach(async () => {
  await fs.rm(taskDir, { recursive: true, force: true });
});

describe("running a single task", () => {
  it("sends the body as one message and completes", async () => {
    await service.createTask("refactor", "one", { body: "Extract the parser", agentType: "code" });

    const outcome = await service.runTask({ list: "refactor", name: "one" });

    expect(outcome.status).toBe("completed");
    expect(fake.spawned).toHaveLength(1);
    expect(fake.spawned[0]!.received).toEqual([{ from: "Task refactor/one", message: "Extract the parser" }]);
  });

  it("sends each step as its own message when the task defines steps", async () => {
    await service.createTask("refactor", "one", { body: "ignored when steps exist", agentType: "code", steps: ["first", "second", "third"] });

    const outcome = await service.runTask({ list: "refactor", name: "one" });

    expect(outcome.status).toBe("completed");
    expect(fake.spawned[0]!.received.map(entry => entry.message)).toEqual(["first", "second", "third"]);
  });

  it("spawns an agent of the task's own agent type", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "research" });
    await service.runTask({ list: "refactor", name: "one" });
    expect(fake.spawned[0]!.agentType).toBe("research");
  });

  it("falls back to the configured default agent type", async () => {
    configure({ defaultAgentType: "research" });
    await service.createTask("refactor", "one", { body: "a" });
    await service.runTask({ list: "refactor", name: "one" });
    expect(fake.spawned[0]!.agentType).toBe("research");
  });

  it("fails without spawning an agent when the task has no body and no steps", async () => {
    await service.createTask("refactor", "empty", { body: "", agentType: "code" });

    const outcome = await service.runTask({ list: "refactor", name: "empty" });

    expect(outcome.status).toBe("failed");
    expect(outcome.message).toContain("nothing to run");
    expect(fake.spawned).toHaveLength(0);
  });

  it("fails without spawning an agent when the agent type does not exist", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "does-not-exist" });

    const outcome = await service.runTask({ list: "refactor", name: "one" });

    expect(outcome.status).toBe("failed");
    expect(outcome.message).toContain("does not exist");
    expect(fake.spawned).toHaveLength(0);
  });

  it("stops at the first step that fails and leaves the rest unsent", async () => {
    await service.createTask("refactor", "one", { body: "x", agentType: "code", steps: ["first", "second", "third"] });
    fake.defaults.responder = (_id, message) => (message === "second" ? { status: "error", message: "boom" } : { status: "success", message: "ok" });

    const outcome = await service.runTask({ list: "refactor", name: "one" });

    expect(outcome.status).toBe("failed");
    expect(outcome.message).toBe("boom");
    expect(fake.spawned[0]!.received.map(entry => entry.message)).toEqual(["first", "second"]);
  });

  it("reports a cancelled response as cancelled rather than failed", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    fake.defaults.responder = () => ({ status: "cancelled", message: "stopped" });

    expect((await service.runTask({ list: "refactor", name: "one" })).status).toBe("cancelled");
  });

  it("reaps the agent for a headless run but keeps it for a non-cleanup run", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    await service.runTask({ list: "refactor", name: "one" }, { headless: true });
    expect(fake.deleted).toHaveLength(1);

    await service.createTask("refactor", "two", { body: "b", agentType: "code" });
    await service.runTask({ list: "refactor", name: "two" }, { headless: false, cleanupAgent: false });
    expect(fake.deleted).toHaveLength(1);
    expect(fake.live.size).toBe(1);
  });

  it("throws for a task that does not exist", async () => {
    await expect(service.runTask({ list: "refactor", name: "missing" })).rejects.toThrow(/not found/);
  });
});

describe("run tracking", () => {
  it("records the run against the task with its agent id", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    const outcome = await service.runTask({ list: "refactor", name: "one" });

    const run = service.getRun(outcome.runId)!;
    expect(run.list).toBe("refactor");
    expect(run.status).toBe("completed");
    expect(run.agentId).toBe(fake.spawned[0]!.id);
    expect(run.finishedAt).not.toBeNull();
    expect(service.getRunsForTask("refactor", "one")).toHaveLength(1);
  });

  it("writes the outcome back into the task's frontmatter", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    fake.defaults.responder = () => ({ status: "success", message: "the result" });
    const outcome = await service.runTask({ list: "refactor", name: "one" });

    const task = (await service.getTask("refactor", "one"))!;
    expect(task.status).toBe("done");
    expect(task.lastRunStatus).toBe("completed");
    expect(task.lastRunId).toBe(outcome.runId);
    expect(task.lastResult).toBe("the result");
    expect(task.lastRunAt).not.toBeNull();
  });

  it("marks a failed task blocked", async () => {
    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    fake.defaults.responder = () => ({ status: "error", message: "boom" });
    await service.runTask({ list: "refactor", name: "one" });

    expect((await service.getTask("refactor", "one"))!.status).toBe("blocked");
  });

  it("does not reopen a task that was already done", async () => {
    await service.updateTask("refactor", "one", { body: "a", agentType: "code", status: "done" });
    await service.runTask({ list: "refactor", name: "one" });

    const task = (await service.getTask("refactor", "one"))!;
    expect(task.status).toBe("done");
    // Bookkeeping is still recorded even though the board status is left alone.
    expect(task.lastRunStatus).toBe("completed");
  });
});

describe("running a group", () => {
  async function seed(count: number, agentType = "code"): Promise<{ list: string; name: string }[]> {
    const refs: { list: string; name: string }[] = [];
    for (let index = 0; index < count; index++) {
      const name = `task-${index}`;
      await service.createTask("batch", name, { body: `work ${index}`, agentType });
      refs.push({ list: "batch", name });
    }
    return refs;
  }

  it("runs every task and reports one outcome each", async () => {
    const refs = await seed(3);
    const { outcomes } = await service.runTasks(refs, { parallel: 3 });

    expect(outcomes).toHaveLength(3);
    expect(outcomes.every(outcome => outcome.status === "completed")).toBe(true);
    expect(fake.spawned).toHaveLength(3);
  });

  it("never exceeds the configured parallelism", async () => {
    const refs = await seed(6);
    fake.defaults.workMs = 20;

    await service.runTasks(refs, { parallel: 2 });

    expect(fake.getLiveHighWater()).toBeLessThanOrEqual(2);
    expect(fake.spawned).toHaveLength(6);
  });

  it("runs strictly one at a time when parallel is 1", async () => {
    const refs = await seed(4);
    await service.runTasks(refs, { parallel: 1 });
    expect(fake.getLiveHighWater()).toBe(1);
  });

  it("groups the runs under a shared batch", async () => {
    const refs = await seed(3);
    const { batchId } = await service.runTasks(refs, { parallel: 3, label: "my batch" });

    const batch = service.getBatch(batchId)!;
    expect(batch.label).toBe("my batch");
    expect(batch.runIds).toHaveLength(3);
    expect(batch.finishedAt).not.toBeNull();
    expect(service.getRuns().filter(run => run.batchId === batchId)).toHaveLength(3);
  });

  it("keeps going after one task fails", async () => {
    const refs = await seed(3);
    // Fail exactly one task, identified by its body, and let the others succeed.
    fake.defaults.responder = (_id, message) => (message === "work 1" ? { status: "error", message: "boom" } : { status: "success", message: "ok" });

    const { outcomes } = await service.runTasks(refs, { parallel: 1 });

    expect(outcomes.filter(outcome => outcome.status === "completed")).toHaveLength(2);
    expect(outcomes.filter(outcome => outcome.status === "failed")).toHaveLength(1);
  });

  it("records tasks that never started as cancelled runs rather than dropping them", async () => {
    const refs = await seed(4);
    const controller = new AbortController();

    const runPromise = service.runTasks(refs, { parallel: 1, signal: controller.signal });
    // Abort once the first task is under way, leaving the rest queued.
    await new Promise(resolve => setTimeout(resolve, 1));
    controller.abort();

    const { batchId, outcomes } = await runPromise;

    expect(outcomes).toHaveLength(4);
    const cancelled = outcomes.filter(outcome => outcome.status === "cancelled");
    expect(cancelled.length).toBeGreaterThan(0);
    // Every task in the batch is still visible in the run history.
    expect(service.getRuns().filter(run => run.batchId === batchId)).toHaveLength(4);
  });

  it("finishes the batch even when the group is aborted", async () => {
    const refs = await seed(3);
    const controller = new AbortController();
    const runPromise = service.runTasks(refs, { parallel: 1, signal: controller.signal });
    controller.abort();

    const { batchId } = await runPromise;
    expect(service.getBatch(batchId)!.finishedAt).not.toBeNull();
  });
});

describe("cancellation", () => {
  it("reports nothing to cancel for an unknown or finished run", async () => {
    expect(service.cancelRun("nope")).toBe(false);

    await service.createTask("refactor", "one", { body: "a", agentType: "code" });
    const outcome = await service.runTask({ list: "refactor", name: "one" });
    expect(service.cancelRun(outcome.runId)).toBe(false);
  });

  it("cancels an in-flight run and stops its agent", async () => {
    await service.createTask("refactor", "slow", { body: "a", agentType: "code" });
    fake.defaults.workMs = 5000;
    const runPromise = service.runTask({ list: "refactor", name: "slow" });
    await waitForSpawn(1);

    const runId = service.getRuns().at(-1)!.id;
    expect(service.cancelRun(runId, "user asked")).toBe(true);

    expect((await runPromise).status).toBe("cancelled");
  });

  it("cancels every in-flight run in a batch", async () => {
    for (const index of [0, 1, 2]) {
      await service.createTask("batch", `task-${index}`, { body: "a", agentType: "code" });
    }
    const refs = [0, 1, 2].map(index => ({ list: "batch", name: `task-${index}` }));

    fake.defaults.workMs = 5000;
    const runPromise = service.runTasks(refs, { parallel: 3 });
    await waitForSpawn(3);

    const batchId = service.getBatches().at(-1)!.id;
    expect(service.cancelBatch(batchId)).toBeGreaterThan(0);

    const { outcomes } = await runPromise;
    expect(outcomes.every(outcome => outcome.status === "cancelled")).toBe(true);
  });
});
