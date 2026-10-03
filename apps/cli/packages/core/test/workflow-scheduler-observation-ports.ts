import assert from "node:assert/strict";
import type { WorkflowGraphNode, WorkflowRunSnapshot } from "@knorvia/contracts";
import type {
  WorkflowGraphSchedulerActivityInput,
  WorkflowGraphSchedulerActivityResult,
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerPlannerInput,
  WorkflowGraphSchedulerPlannerRunResult,
  WorkflowGraphSchedulerRunOptions,
} from "../src/workflow/scheduler/types.js";
export { gate } from "./tool-invocation-fixture.js";

export const node = (id: string, fields: Partial<WorkflowGraphNode> = {}): WorkflowGraphNode => ({
  id,
  title: `Owned ${id}`,
  dependsOn: [],
  kind: "task",
  status: "pending",
  ...fields,
});
export function snapshot(nodes: WorkflowGraphNode[], runId = "owned-run"): WorkflowRunSnapshot {
  return {
    activities: [],
    artifacts: [],
    createdAt: "seed",
    cwd: "owned-workspace",
    graph: { nodes, edges: [], collections: [] },
    kind: "expert",
    phaseOrder: ["execute"],
    phases: [],
    recoveryActions: [],
    runId,
    schemaVersion: 1,
    sessionLinks: [],
    status: "running",
    task: "Owned synthetic task",
    updatedAt: "seed",
    strategy: {
      clarify: { confidenceThreshold: 0.8, minRounds: 1, maxRounds: 3 },
      executor: {
        drainingChangeHours: 1,
        frontierTarget: 1,
        maxConcurrentLoops: 2,
        maxConsecutiveErrors: 2,
        maxPlannerRuns: 2,
      },
      finalCritic: { maxIterations: 1 },
      reactLoop: { maxRounds: 1 },
    },
  };
}
export function ports(initial: WorkflowRunSnapshot) {
  const controller = new AbortController();
  const trace: string[] = [];
  const writes: WorkflowRunSnapshot[] = [];
  const events: Parameters<WorkflowGraphSchedulerDeps["appendEvent"]>[0][] = [];
  const requests: WorkflowGraphSchedulerActivityInput[] = [];
  const plannerRequests: WorkflowGraphSchedulerPlannerInput[] = [];
  let clock = 0,
    activity = 0;
  const result: WorkflowGraphSchedulerActivityResult = {
    response: "Owned response",
    sessionId: "owned-child",
  };
  const hooks = {
    run: (
      _input: WorkflowGraphSchedulerActivityInput,
    ): Promise<WorkflowGraphSchedulerActivityResult> => Promise.resolve(result),
    planner: (
      _input: WorkflowGraphSchedulerPlannerInput,
    ): Promise<WorkflowGraphSchedulerPlannerRunResult> =>
      Promise.resolve({
        response: "Owned planner response",
        sessionId: "owned-planner",
        nodes: [],
        edges: [],
        exhausted: true,
      }),
    write: (_value: WorkflowRunSnapshot): Promise<void> => Promise.resolve(),
    event: (_event: (typeof events)[number]): Promise<void> => Promise.resolve(),
  };
  const options: WorkflowGraphSchedulerRunOptions = {
    abortSignal: controller.signal,
    buildPrompt: () => "Owned node prompt",
    cwd: "owned-cwd",
    phase: "execute",
    snapshot: initial,
  };
  const deps: WorkflowGraphSchedulerDeps = {
    createActivityId() {
      trace.push(`activity:${++activity}`);
      return `owned-activity-${activity}`;
    },
    now() {
      trace.push(`clock:${clock}`);
      return new Date(clock++ * 1000);
    },
    runner: {
      run(input) {
        assert.equal(this, deps.runner);
        requests.push(input);
        trace.push(`runner:${input.runId}:${input.node.id}`);
        return hooks.run(input);
      },
    },
    plannerRunner: {
      run(input) {
        assert.equal(this, deps.plannerRunner);
        plannerRequests.push(input);
        trace.push(`planner:${input.collection.collectionId}`);
        return hooks.planner(input);
      },
    },
    writeSnapshot(value, settings) {
      assert.equal(settings?.signal, controller.signal);
      writes.push(value);
      trace.push(
        `write:${value.runId}:${value.graph.nodes.map((n) => `${n.id}=${n.status}`).join(",")}`,
      );
      return hooks.write(value);
    },
    writeArtifact(runId, name, content, settings) {
      assert.equal(settings?.signal, controller.signal);
      trace.push(`artifact:${runId}:${name}:${content}`);
      return Promise.resolve({ path: `owned/${name}`, relativePath: name });
    },
    appendGraphRecord(runId, record, settings) {
      assert.equal(settings?.signal, controller.signal);
      trace.push(`record:${runId}:${record.recordType}:${"status" in record ? record.status : ""}`);
      return Promise.resolve();
    },
    appendEvent(event, settings) {
      assert.equal(settings?.signal, controller.signal);
      events.push(event);
      trace.push(`event:${event.type}:${event.nodeId ?? ""}`);
      return hooks.event(event);
    },
    onWorkflowEvent(event) {
      assert.equal(events.at(-1), event);
      trace.push(`callback:${event.type}:${event.nodeId ?? ""}`);
    },
  };
  return {
    controller,
    trace,
    writes,
    events,
    requests,
    plannerRequests,
    result,
    hooks,
    options,
    deps,
  };
}
