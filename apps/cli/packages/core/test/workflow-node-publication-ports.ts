import assert from "node:assert/strict";
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import type { WorkflowNodeRunnerRuntime } from "../src/workflow/scheduler/node-runner.js";
import type {
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerRunOptions,
} from "../src/workflow/scheduler/types.js";
export { gate } from "./tool-invocation-fixture.js";

export function ports() {
  const node = {
    id: "owned/node",
    title: "Owned node",
    status: "pending" as const,
    attempts: 0,
    dependsOn: [],
    kind: "task" as const,
  };
  let snapshot = {
    activities: [],
    artifacts: [
      {
        contentType: "text/plain",
        createdAt: "seed",
        label: "Owned input",
        path: "owned/input.txt",
        phase: "execute",
      },
    ],
    createdAt: "seed",
    cwd: "owned-workspace",
    graph: { nodes: [node], edges: [], collections: [] },
    kind: "expert",
    phaseOrder: ["execute"],
    phases: [],
    recoveryActions: [],
    runId: "owned-run",
    schemaVersion: 1,
    sessionLinks: [],
    status: "running",
    task: "Owned synthetic task",
    updatedAt: "seed",
    strategy: { executor: { maxConcurrentLoops: 1, maxConsecutiveErrors: 1 } },
  } as unknown as WorkflowRunSnapshot;
  const controller = new AbortController();
  const trace: string[] = [],
    writes: WorkflowRunSnapshot[] = [],
    messages: unknown[] = [];
  let ticks = 0;
  let request: WorkflowGraphSchedulerActivityInput | undefined;
  const result = {
    response: "Owned response",
    sessionId: "owned-child",
    model: "owned-model",
    traceId: "owned-trace",
    turnId: "owned-turn",
  };
  const hooks = {
    run: (_input: WorkflowGraphSchedulerActivityInput): any => Promise.resolve(result),
    write: (_snapshot: WorkflowRunSnapshot): any => Promise.resolve(),
    artifact: (): any =>
      Promise.resolve({ path: "owned-output.md", relativePath: "owned/answer.md" }),
    event: (_type: string): any => Promise.resolve(),
    status: (_status: string): any => Promise.resolve(),
  };
  const options = {
    abortSignal: controller.signal,
    cwd: "owned-cwd",
    phase: "execute",
    parentSessionId: "owned-parent",
    snapshot,
    onEvent: () => {},
    buildPrompt: () => "Owned custom prompt",
  } satisfies WorkflowGraphSchedulerRunOptions;
  const access = {
    getSnapshot() {
      assert.equal(this, access);
      trace.push("snapshot:get");
      return snapshot;
    },
    setSnapshot(next: WorkflowRunSnapshot) {
      assert.equal(this, access);
      trace.push(`snapshot:set:${next.graph.nodes[0]!.status}`);
      snapshot = next;
      return next;
    },
  };
  const eventLog = {
    timestamp() {
      assert.equal(this, eventLog);
      trace.push(`clock:${ticks}`);
      return new Date(ticks++ * 1000).toISOString();
    },
    appendGraphStatus(
      value: WorkflowRunSnapshot,
      id: string,
      phase: string,
      status: string,
      signal: AbortSignal,
    ) {
      assert.equal(this, eventLog);
      assert.equal(value, snapshot);
      assert.equal(id, node.id);
      assert.equal(phase, options.phase);
      assert.equal(signal, controller.signal);
      trace.push(`status:${status}`);
      return hooks.status(status);
    },
    emitEvent(value: WorkflowRunSnapshot, type: string, event: any) {
      assert.equal(this, eventLog);
      assert.equal(value, snapshot);
      assert.equal(event.signal, controller.signal);
      trace.push(`event:${type}`);
      messages.push({ type, ...event });
      return hooks.event(type);
    },
  };
  const runtime = {
    createActivityId() {
      assert.equal(this, runtime);
      trace.push("activity:id");
      return "owned-activity";
    },
    eventLog,
    runner: {
      run(input: WorkflowGraphSchedulerActivityInput) {
        assert.equal(this, runtime.runner);
        request = input;
        trace.push("runner:run");
        return hooks.run(input);
      },
    },
    writeArtifact(runId: string, name: string, text: string, settings: any) {
      assert.equal(this, runtime);
      assert.equal(runId, "owned-run");
      assert.equal(text, result.response);
      assert.equal(settings.signal, controller.signal);
      trace.push(`artifact:${name}`);
      return hooks.artifact();
    },
    writeSnapshot(next: WorkflowRunSnapshot, settings: any) {
      assert.equal(this, runtime);
      assert.equal(settings.signal, controller.signal);
      trace.push(`write:${next.graph.nodes[0]!.status}`);
      writes.push(next);
      return hooks.write(next);
    },
  } as unknown as WorkflowNodeRunnerRuntime;
  return {
    node,
    controller,
    trace,
    writes,
    messages,
    result,
    hooks,
    options,
    access,
    runtime,
    get snapshot() {
      return snapshot;
    },
    set snapshot(value) {
      snapshot = value;
    },
    get request() {
      return request;
    },
  };
}
export function observation(f: ReturnType<typeof ports>, outcome: unknown) {
  return {
    trace: f.trace,
    writes: f.writes,
    snapshot: f.snapshot,
    outcome,
    messages: f.messages.map(({ signal: _signal, ...value }: any) => value),
    activityKeys: f.snapshot.activities.map((value) => Object.keys(value)),
    request: f.request && {
      ...f.request,
      abortSignal: "owned-signal",
      node: f.request.node,
      onChildSessionStarted: "owned-callback",
      onEvent: f.request.onEvent === f.options.onEvent,
      traceContext: f.request.traceContext,
    },
  };
}
export function schedulerPorts() {
  const f = ports();
  const trace: string[] = [],
    snapshots: WorkflowRunSnapshot[] = [],
    events: any[] = [];
  let ticks = 0;
  const deps: WorkflowGraphSchedulerDeps = {
    createActivityId: () => "owned-activity",
    now: () => new Date(ticks++ * 1000),
    runner: {
      run(input) {
        trace.push("runner:run");
        return f.hooks.run(input);
      },
    },
    async writeSnapshot(value, settings) {
      assert.equal(settings?.signal, f.controller.signal);
      snapshots.push(value);
      trace.push(`write:${value.graph.nodes[0]!.status}`);
      await f.hooks.write(value);
    },
    async writeArtifact(_run, name, text, settings) {
      assert.equal(settings?.signal, f.controller.signal);
      assert.equal(text, f.result.response);
      trace.push(`artifact:${name}`);
      return f.hooks.artifact();
    },
    async appendGraphRecord(_run, record, settings) {
      assert.equal(settings?.signal, f.controller.signal);
      trace.push(`record:${"status" in record ? record.status : record.recordType}`);
    },
    async appendEvent(event, settings) {
      assert.equal(settings?.signal, f.controller.signal);
      events.push(event);
      trace.push(`event:${event.type}`);
      await f.hooks.event(event.type);
    },
  };
  return { f, deps, trace, snapshots, events };
}
