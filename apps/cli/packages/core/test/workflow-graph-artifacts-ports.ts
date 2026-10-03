import assert from "node:assert/strict";
import type {
  WorkflowGraphRecord,
  WorkflowPhaseDefinition,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import type { ExpertWorkflowRuntimeContext } from "../src/workflow/expert/runtime-context.js";
import { node, snapshot } from "./workflow-scheduler-observation-ports.js";
export { gate } from "./tool-invocation-fixture.js";
export const seedResponse = JSON.stringify({
  newNodes: [{ id: "N", title: "Owned N", collectionId: "K" }],
  collections: [{ collectionId: "K", nodeIds: ["N"], title: "Owned K" }],
  nodePrompts: [{ id: "A", prompt: "Owned revised prompt" }],
});
export const promptResponse = JSON.stringify({
  nodes: [{ id: "A", prompt: "Owned revised prompt" }],
});
export const definition = (): WorkflowPhaseDefinition => ({
  phase: "plan",
  title: "Owned phase",
  description: "Owned description",
  behavior: "agent",
  seedGraphFromArtifact: { targetPhase: "execute", gateAfterPhase: "plan" },
  nodePromptsFromArtifact: { targetPhase: "execute" },
});
export function owned() {
  const initial = snapshot([
    node("phase:plan", { kind: "phase", phase: "plan", status: "completed" }),
    node("A", { phase: "execute", prompt: "Owned original prompt" }),
  ]);
  const controller = new AbortController(),
    trace: unknown[] = [],
    writes: WorkflowRunSnapshot[] = [],
    records: WorkflowGraphRecord[] = [];
  const events: Array<{ runId: string; type: string; options: Record<string, unknown> }> = [];
  const hooks = {
    write: (_s: WorkflowRunSnapshot): unknown => Promise.resolve(),
    record: (_r: WorkflowGraphRecord): unknown => Promise.resolve(),
    event: (): unknown => Promise.resolve(),
    tick: () => 0,
  };
  const store = {
    writeSnapshot(value: WorkflowRunSnapshot, options: { signal?: AbortSignal }) {
      assert.equal(this, store);
      assert.equal(options.signal, controller.signal);
      assert.deepEqual(Object.keys(options), ["signal"]);
      trace.push(["write", hooks.tick(), value.runId]);
      writes.push(value);
      return hooks.write(value) as Promise<void>;
    },
    appendGraphRecord(
      runId: string,
      record: WorkflowGraphRecord,
      options: { signal?: AbortSignal },
    ) {
      assert.equal(this, store);
      assert.equal(options.signal, controller.signal);
      assert.deepEqual(Object.keys(options), ["signal"]);
      trace.push(["record", hooks.tick(), runId, record.recordType, Object.keys(record)]);
      records.push(record);
      return hooks.record(record) as Promise<void>;
    },
  };
  let clock = 0;
  const value = {
    store,
    definition: { kind: "expert", phaseOrder: ["plan"] },
    timestamp() {
      assert.equal(this, value);
      trace.push(["clock", hooks.tick(), ++clock]);
      return `owned-time-${clock}`;
    },
    appendEvent(runId: string, type: string, options: Record<string, unknown>) {
      assert.equal(this, value);
      assert.equal(options.signal, controller.signal);
      trace.push(["event", hooks.tick(), runId, type, Object.keys(options)]);
      events.push({ runId, type, options });
      return hooks.event() as Promise<void>;
    },
    updateSnapshot(s: WorkflowRunSnapshot, patch: Partial<WorkflowRunSnapshot>) {
      return { ...s, ...patch };
    },
    getPhaseDefinition: definition,
    ownedPhase(s: WorkflowRunSnapshot) {
      trace.push(["phase", hooks.tick()]);
      return { snapshot: s, response: seedResponse };
    },
  };
  const ctx = value as unknown as ExpertWorkflowRuntimeContext;
  return { ctx, initial, controller, trace, writes, records, events, hooks };
}
export type Ports = ReturnType<typeof owned>;
export function observations(p: Ports) {
  return { trace: p.trace, writes: p.writes, records: p.records, events: p.events };
}
export async function withTicks<T>(p: Ports, run: () => Promise<T>) {
  let tick = 0,
    done = false;
  p.hooks.tick = () => tick;
  const promise = run();
  const pulse = () => {
    if (!done) {
      tick += 1;
      queueMicrotask(pulse);
    }
  };
  const settled = promise.then(
    (result) => {
      done = true;
      p.trace.push(["resolved", tick]);
      return result;
    },
    (error) => {
      done = true;
      p.trace.push(["rejected", tick]);
      throw error;
    },
  );
  queueMicrotask(pulse);
  return settled;
}
