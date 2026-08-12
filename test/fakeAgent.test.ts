import { AgentManager } from "@tokenring-ai/agent";
import { AgentEventState } from "@tokenring-ai/agent/state/agentEventState";
import type TokenRingApp from "@tokenring-ai/app";
import StateManager from "@tokenring-ai/app/StateManager";

/**
 * Test harness shared by the TaskService suites.
 *
 * Adapted from plugin/queue/test/QueueService.test.ts, with two additions the task engine needs:
 * `waitForState` (the engine waits for an agent to go idle before sending) and `chatOutput`
 * (status forwarding to a parent agent).
 *
 * Named `.test.ts` so the workspace's export rules pick it up, matching createTestingApp.test.
 */

export type ResponseStatus = "success" | "error" | "cancelled";

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

/**
 * A lightweight stand-in for an Agent backed by a real StateManager + AgentEventState. handleInput
 * queues an input and schedules an agent.response (via `responder`) after `workMs`, letting the
 * engine's subscribe/cursor machinery work end-to-end without a real agent loop.
 */
export class FakeAgent {
  readonly id = `agent-${nextId()}`;
  readonly agentShutdownController = new AbortController();
  readonly agentShutdownSignal = this.agentShutdownController.signal;
  private readonly sm = new StateManager<any>({});
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Every message this agent was sent, in order. */
  readonly received: { from: string; message: string }[] = [];
  /** Anything forwarded to this agent as a parent via chatOutput. */
  readonly chatOutputs: string[] = [];

  responder: (requestId: string, message: string) => { status: ResponseStatus; message: string } = () => ({
    status: "success",
    message: "done",
  });
  workMs = 5;

  constructor(readonly agentType: string = "code") {
    this.sm.initializeState(AgentEventState, {});
  }

  handleInput(input: { from: string; message: string }): string {
    const requestId = `req-${nextId()}`;
    this.received.push({ from: input.from, message: input.message });

    this.sm.mutateState(AgentEventState, s =>
      s.emit({
        type: "input.received",
        timestamp: Date.now(),
        input: { from: input.from, message: input.message },
        requestId,
      }),
    );

    this.timer = setTimeout(() => {
      const r = this.responder(requestId, input.message);
      this.sm.mutateState(AgentEventState, s => s.emit({ type: "agent.response", timestamp: Date.now(), requestId, status: r.status, message: r.message }));
    }, this.workMs);

    return requestId;
  }

  getState<T>(type: new (...args: any[]) => T): T {
    return this.sm.getState(type);
  }

  subscribeStateAsync(type: any, signal: AbortSignal) {
    return this.sm.subscribeAsync(type, signal);
  }

  waitForState(type: any, predicate: any, signal: AbortSignal) {
    return this.sm.waitForState(type, predicate, signal);
  }

  chatOutput(message: string): void {
    this.chatOutputs.push(message);
  }

  getAbortSignal(): AbortSignal {
    return new AbortController().signal;
  }

  abortCurrentOperation(): boolean {
    return true;
  }

  shutdown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.agentShutdownController.abort();
  }
}

export interface FakeAgentManager {
  agentManager: AgentManager;
  live: Map<string, FakeAgent>;
  spawned: FakeAgent[];
  deleted: string[];
  getLiveHighWater: () => number;
  /**
   * Applied to every agent at spawn time. Set these before starting a run — reaching into
   * `spawned[n]` afterwards races against the agent already having replied.
   */
  defaults: { responder?: FakeAgent["responder"]; workMs?: number };
}

/**
 * Registers a real AgentManager (so the service name matches) with spawn/get/delete overridden to
 * return FakeAgents, tracking the concurrency high-water mark used to assert `parallel`.
 *
 * `knownAgentTypes` drives getAgentConfig, which the engine checks before spawning; pass an empty
 * array to simulate a task pointing at an agent type that does not exist.
 */
export function installFakeAgentManager(app: TokenRingApp, knownAgentTypes: string[] = ["code", "research"]): FakeAgentManager {
  const agentManager = new AgentManager(app);
  app.addService(agentManager);

  const live = new Map<string, FakeAgent>();
  const spawned: FakeAgent[] = [];
  const deleted: string[] = [];
  const defaults: FakeAgentManager["defaults"] = {};
  let liveHighWater = 0;

  (agentManager as any).getAgentConfig = (agentType: string) => (knownAgentTypes.includes(agentType) ? { agentType, displayName: agentType } : undefined);
  (agentManager as any).getAgentConfigEntries = () => knownAgentTypes.map(type => [type, { displayName: type, description: "" }]);

  (agentManager as any).spawnAgent = ({ agentType }: { agentType: string; headless: boolean }) => {
    const agent = new FakeAgent(agentType);
    if (defaults.responder) agent.responder = defaults.responder;
    if (defaults.workMs !== undefined) agent.workMs = defaults.workMs;
    live.set(agent.id, agent);
    spawned.push(agent);
    liveHighWater = Math.max(liveHighWater, live.size);
    return agent;
  };
  (agentManager as any).getAgent = (id: string) => live.get(id) ?? null;
  (agentManager as any).deleteAgent = (id: string) => {
    const agent = live.get(id);
    if (agent) {
      agent.shutdown();
      live.delete(id);
      deleted.push(id);
    }
    return true;
  };

  return { agentManager, live, spawned, deleted, defaults, getLiveHighWater: () => liveHighWater };
}
