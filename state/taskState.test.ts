import { beforeEach, describe, expect, it } from "bun:test";
import type { NewTaskRun } from "./taskState.ts";
import { isRunFinished, TaskState } from "./taskState.ts";

function newRun(id: string, overrides: Partial<NewTaskRun> = {}): NewTaskRun {
  return {
    id,
    batchId: null,
    list: "demo",
    name: id,
    title: id,
    agentType: "code",
    messages: ["do the thing"],
    ...overrides,
  };
}

describe("isRunFinished", () => {
  it("treats only terminal statuses as finished", () => {
    expect(isRunFinished("completed")).toBe(true);
    expect(isRunFinished("failed")).toBe(true);
    expect(isRunFinished("cancelled")).toBe(true);
    expect(isRunFinished("starting")).toBe(false);
    expect(isRunFinished("running")).toBe(false);
  });
});

describe("TaskState", () => {
  let state: TaskState;

  beforeEach(() => {
    state = new TaskState(3);
  });

  it("registers a run with bookkeeping defaults", () => {
    const run = state.addRun(newRun("a"));
    expect(run.status).toBe("starting");
    expect(run.agentId).toBeNull();
    expect(run.currentStep).toBe(0);
    expect(run.finishedAt).toBeNull();
    expect(run.startedAt).toBeGreaterThan(0);
    expect(state.getRun("a")).toEqual(run);
  });

  it("copies the message array so later edits cannot mutate a registered run", () => {
    const messages = ["one"];
    const run = state.addRun(newRun("a", { messages }));
    messages.push("two");
    expect(run.messages).toEqual(["one"]);
  });

  it("looks runs up by agent id and by task", () => {
    state.addRun(newRun("a"));
    state.updateRun("a", { agentId: "agent-1" });
    state.addRun(newRun("b", { list: "other" }));

    expect(state.getRunByAgentId("agent-1")?.id).toBe("a");
    expect(state.getRunsForTask("demo", "a").map(run => run.id)).toEqual(["a"]);
    expect(state.getRunsForTask("other", "b").map(run => run.id)).toEqual(["b"]);
  });

  it("advances currentStep to the end of the message list when a run completes", () => {
    state.addRun(newRun("a", { messages: ["one", "two", "three"] }));
    state.finishRun("a", "completed", "done");

    const run = state.getRun("a")!;
    expect(run.currentStep).toBe(3);
    expect(run.status).toBe("completed");
    expect(run.finishedAt).not.toBeNull();
  });

  it("leaves currentStep alone when a run fails partway through", () => {
    state.addRun(newRun("a", { messages: ["one", "two", "three"] }));
    state.updateRun("a", { currentStep: 1, status: "running" });
    state.finishRun("a", "failed", "boom");

    expect(state.getRun("a")!.currentStep).toBe(1);
  });

  it("attaches runs to their batch and finishes the batch once", () => {
    const batch = state.addBatch({ id: "batch-1", label: "demo run", list: "demo", parallel: 2 });
    state.addRun(newRun("a", { batchId: "batch-1" }));
    state.addRun(newRun("b", { batchId: "batch-1" }));

    expect(state.getBatch("batch-1")!.runIds).toEqual(["a", "b"]);

    state.finishBatch("batch-1");
    const finishedAt = state.getBatch("batch-1")!.finishedAt;
    expect(finishedAt).not.toBeNull();

    state.finishBatch("batch-1");
    expect(state.getBatch("batch-1")!.finishedAt).toBe(finishedAt);
    expect(batch.id).toBe("batch-1");
  });

  it("trims the oldest finished runs beyond maxFinishedRuns", () => {
    for (const id of ["a", "b", "c", "d", "e"]) {
      state.addRun(newRun(id));
      state.finishRun(id, "completed", "done");
    }

    expect(state.runs.map(run => run.id)).toEqual(["c", "d", "e"]);
  });

  it("never trims runs that are still in flight", () => {
    for (const id of ["a", "b", "c", "d"]) {
      state.addRun(newRun(id));
      state.finishRun(id, "completed", "done");
    }
    state.addRun(newRun("live"));
    state.updateRun("live", { status: "running" });

    for (const id of ["e", "f"]) {
      state.addRun(newRun(id));
      state.finishRun(id, "completed", "done");
    }

    expect(state.getRun("live")).not.toBeNull();
    expect(state.runs.filter(run => isRunFinished(run.status))).toHaveLength(3);
  });

  it("drops batches once every one of their runs has been trimmed", () => {
    state.addBatch({ id: "old", label: "old", list: "demo", parallel: 1 });
    state.addRun(newRun("a", { batchId: "old" }));
    state.finishRun("a", "completed", "done");

    for (const id of ["b", "c", "d"]) {
      state.addRun(newRun(id));
      state.finishRun(id, "completed", "done");
    }

    expect(state.getRun("a")).toBeNull();
    expect(state.getBatch("old")).toBeNull();
  });

  it("records in-flight runs as cancelled when the application restarts", () => {
    state.addRun(newRun("done-run"));
    state.finishRun("done-run", "completed", "all good");
    state.addBatch({ id: "batch-1", label: "demo", list: "demo", parallel: 1 });
    state.addRun(newRun("live-run", { batchId: "batch-1" }));
    state.updateRun("live-run", { status: "running", currentStep: 1 });

    const restored = new TaskState(3);
    restored.deserialize(state.serialize());

    const live = restored.getRun("live-run")!;
    expect(live.status).toBe("cancelled");
    expect(live.message).toBe("Interrupted by an application restart");
    expect(live.finishedAt).not.toBeNull();
    // A run that had already finished keeps its outcome.
    expect(restored.getRun("done-run")!.status).toBe("completed");
    expect(restored.getRun("done-run")!.message).toBe("all good");
    expect(restored.getBatch("batch-1")!.finishedAt).not.toBeNull();
  });

  it("serializes a detached copy so later mutation does not leak into the snapshot", () => {
    state.addRun(newRun("a"));
    const snapshot = state.serialize();
    state.updateRun("a", { status: "running" });

    expect(snapshot.runs[0]!.status).toBe("starting");
  });
});
