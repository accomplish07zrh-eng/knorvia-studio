// Frozen compatibility cases; retained Apache-2.0, no authorship/clearance claim.
import type { WorkflowRunState, WorkflowRunNode } from "../src/protocol-v4/workflow-runs.js";

export const workflowModuleRoot = new URL(
  `../${process.env.KNORVIA_WORKFLOW_TEST_TARGET ?? "src"}/protocol-v4/`,
  import.meta.url,
);
export async function loadWorkflowHelpers() {
  const [concurrency, phases, progress] = await Promise.all([
    import(new URL("workflow-runs-concurrency.js", workflowModuleRoot).href),
    import(new URL("workflow-runs-phases.js", workflowModuleRoot).href),
    import(new URL("workflow-runs-node-progress.js", workflowModuleRoot).href),
  ]);
  return {
    ...concurrency,
    ...phases,
    ...progress,
  } as typeof import("../src/protocol-v4/workflow-runs-concurrency.js") &
    typeof import("../src/protocol-v4/workflow-runs-phases.js") &
    typeof import("../src/protocol-v4/workflow-runs-node-progress.js");
}
export type WorkflowHelpers = Awaited<ReturnType<typeof loadWorkflowHelpers>>;
export function fixtureNode(extra: Partial<WorkflowRunNode> = {}): WorkflowRunNode {
  return {
    siteId: "fixture-site",
    ordinal: 1,
    phase: "executing",
    instructionsHead: "fixture task",
    turn: 9,
    toolCalls: 40,
    lastTool: { name: "FixtureTool", target: "synthetic-target" },
    ...extra,
  };
}
export function fixtureRun(extra: Partial<WorkflowRunState> = {}): WorkflowRunState {
  return {
    runId: "fixture-run",
    status: "running",
    usage: { spentTokens: 0, nodesUsed: 0 },
    actors: [],
    nodes: [fixtureNode()],
    lastEventSequence: 0,
    ...extra,
  } as WorkflowRunState;
}
export function freezeWorkflow<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeWorkflow(item);
  }
  return value;
}
export function observeWorkflow(run: () => unknown): unknown {
  try {
    const value = run();
    return value === undefined ? { valueType: "undefined" } : JSON.parse(JSON.stringify(value));
  } catch (error) {
    return { thrown: { name: (error as Error).name, message: (error as Error).message } };
  }
}
function runObservation(run: WorkflowRunState, result: WorkflowRunState) {
  return {
    value: result,
    json: JSON.stringify(result),
    sameRun: result === run,
    sameNodes: result.nodes === run.nodes,
    sameNode: result.nodes[0] === run.nodes[0],
    samePhases: result.phases === run.phases,
    sameConcurrency: result.concurrency === run.concurrency,
  };
}
export function workflowContractCases() {
  const cases: { key: string; run: (api: WorkflowHelpers) => unknown }[] = [];
  const add = (key: string, run: (api: WorkflowHelpers) => unknown) => cases.push({ key, run });
  const addRun = (
    key: string,
    run: WorkflowRunState,
    call: (api: WorkflowHelpers, run: WorkflowRunState) => WorkflowRunState,
  ) => {
    freezeWorkflow(run);
    add(key, (api) => runObservation(run, call(api, run)));
  };
  const numbers = [
    undefined,
    null,
    "2",
    0,
    -1,
    1,
    2.5,
    8,
    1024,
    1025,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  const observedRun = fixtureRun({
    concurrency: { key: "old-key", cap: 2, ceiling: 16, limit: 3, cooldownMs: 100 },
  });
  for (const [index, next] of numbers.entries()) {
    for (const [context, run] of [fixtureRun(), observedRun].entries()) {
      addRun(`concurrency/next-${index}-${context}`, run, (api, current) =>
        api.reduceConcurrencyChanged(current, { next }),
      );
    }
    addRun(`concurrency/previous-${index}`, observedRun, (api, run) =>
      api.reduceConcurrencyChanged(run, { next: 4, previous: next, key: "fixture-key" }),
    );
    addRun(`concurrency/cooldown-${index}`, observedRun, (api, run) =>
      api.reduceConcurrencyChanged(run, { next: 4, cooldownMs: next }),
    );
    addRun(`concurrency/start-ceiling-${index}`, observedRun, (api, run) =>
      api.reduceRunStartedConcurrency(run, {
        caps: { maxConcurrency: 1 },
        concurrencyCeiling: next,
      }),
    );
    addRun(`concurrency/start-limit-${index}`, observedRun, (api, run) =>
      api.reduceRunStartedConcurrency(run, {
        caps: { maxConcurrency: next },
        concurrencyCeiling: 16,
      }),
    );
  }
  for (const [index, key] of [
    undefined,
    "",
    " ",
    "fixture-key",
    "x".repeat(256),
    "x".repeat(257),
    "😀".repeat(128),
    1,
    {},
  ].entries()) {
    addRun(`concurrency/key-${index}`, observedRun, (api, run) =>
      api.reduceConcurrencyChanged(run, { next: 3, previous: 32, key, cooldownMs: 0 }),
    );
  }
  for (const [index, reason] of ["idle_reset", "rate-limit", undefined, "IDLE_RESET"].entries()) {
    addRun(`concurrency/reason-${index}`, observedRun, (api, run) =>
      api.reduceConcurrencyChanged(run, { next: 4, reason, cooldownMs: 200 }),
    );
  }
  for (const [index, caps] of [
    undefined,
    null,
    [],
    {},
    { maxConcurrency: 1 },
    { maxConcurrency: 16 },
    Object.create({ maxConcurrency: 1 }),
  ].entries()) {
    addRun(`concurrency/caps-${index}`, fixtureRun(), (api, run) =>
      api.reduceRunStartedConcurrency(run, { caps, concurrencyCeiling: 16 }),
    );
  }
  for (const [index, concurrency] of [
    undefined,
    { cap: 2, ceiling: 16 },
    { cap: 2, ceiling: 16, cooldownMs: undefined },
    { cap: 2, ceiling: 16, cooldownMs: 0 },
    { cap: 2, ceiling: 16, cooldownMs: 200 },
  ].entries()) {
    addRun(`concurrency/clear-${index}`, fixtureRun({ concurrency }), (api, run) =>
      api.withoutCooldown(run),
    );
  }
  const names = [
    undefined,
    null,
    "phase",
    [],
    [null, 1, "", " ", "first", "first"],
    ["one", "two", "three"],
    ["x".repeat(129), "😀".repeat(65)],
    Array.from({ length: 40 }, (_, index) => `phase-${index}`),
  ];
  const graphs = [
    undefined,
    null,
    [],
    [[1, 1, 0, -1, 32, 2.5, "2", NaN, 2], [0, 0, 2], [1]],
    [[1]],
    [1, {}, [0]],
    [[0], [1], [2]],
    [[-0], [-0, 2]],
    [[2, 1], [2, 0], [1, 0], [0]],
  ];
  for (const [index, phaseNames] of names.entries()) {
    addRun(`phases/names-${index}`, fixtureRun({ phaseAlongside: [[1], [0]] }), (api, run) =>
      api.reduceRunLaunched(run, { phaseNames }),
    );
  }
  for (const [index, phaseAlongside] of graphs.entries()) {
    addRun(`phases/graph-${index}`, fixtureRun(), (api, run) =>
      api.reduceRunLaunched(run, { phaseNames: ["first", "second", "third"], phaseAlongside }),
    );
  }
  addRun("phases/filtered-indexes", fixtureRun(), (api, run) =>
    api.reduceRunLaunched(run, {
      phaseNames: ["", "first", 2, "second"],
      phaseAlongside: [[1, 1], [0], [0]],
    }),
  );
  const phaseRuns = [
    fixtureRun(),
    fixtureRun({
      phases: [
        { name: "first", rounds: 3 },
        { name: "first", rounds: 1 },
      ],
    }),
    fixtureRun({
      phases: Array.from({ length: 32 }, (_, index) => ({ name: `phase-${index}`, rounds: 1 })),
    }),
    fixtureRun({ phases: [{ name: "first", rounds: 3 }], truncated: true }),
  ];
  for (const [index, name] of [
    undefined,
    null,
    "",
    "first",
    "new",
    " ",
    "x".repeat(129),
    "😀".repeat(65),
    1,
  ].entries()) {
    for (const [context, run] of phaseRuns.entries()) {
      addRun(`phases/enter-name-${index}-${context}`, run, (api, current) =>
        api.reducePhaseEntered(current, { name, ordinal: 2 }),
      );
    }
  }
  for (const [index, ordinal] of numbers.entries()) {
    addRun(`phases/ordinal-${index}`, phaseRuns[1]!, (api, run) =>
      api.reducePhaseEntered(run, { name: "first", ordinal }),
    );
  }
  for (const [index, eventType] of [
    "node-queued",
    "node-settled",
    "node-executing",
    "node-waiting",
    "unknown",
  ].entries()) {
    for (const [headIndex, instructionsHead] of [
      undefined,
      "",
      "new head",
      "x".repeat(241),
      "😀".repeat(121),
    ].entries()) {
      for (const [cachedIndex, cached] of [undefined, false, true].entries()) {
        const previous = freezeWorkflow(fixtureNode());
        add(`node/carry-${index}-${headIndex}-${cachedIndex}`, (api) => {
          const result = api.carryNodeProgress(eventType, { instructionsHead, cached }, previous);
          return {
            value: result,
            json: JSON.stringify(result),
            sameLastTool: result.lastTool === previous.lastTool,
          };
        });
      }
    }
  }
  add("node/carry-missing-previous", (api) => api.carryNodeProgress("node-waiting", {}, undefined));
  for (const [index, number] of numbers.entries()) {
    addRun(`node/turn-${index}`, fixtureRun(), (api, run) =>
      api.reduceNodeProgress(run, { siteId: "fixture-site", ordinal: 1 }, { turn: number }),
    );
    addRun(`node/toolCalls-${index}`, fixtureRun(), (api, run) =>
      api.reduceNodeProgress(run, { siteId: "fixture-site", ordinal: 1 }, { toolCalls: number }),
    );
  }
  const tools = [
    undefined,
    null,
    [],
    {},
    { target: "fixture" },
    { name: "" },
    { name: " " },
    { name: "FixtureTool", target: "" },
    { name: "x".repeat(65), target: "x".repeat(121) },
    { name: "😀".repeat(33), target: "😀".repeat(61) },
    Object.create({ name: "InheritedTool", target: "fixture" }),
  ];
  for (const [index, lastTool] of tools.entries()) {
    addRun(`node/tool-${index}`, fixtureRun(), (api, run) =>
      api.reduceNodeProgress(
        run,
        { siteId: "fixture-site", ordinal: 1 },
        { turn: 1, toolCalls: 0, lastTool },
      ),
    );
  }
  for (const [index, ref] of [
    { siteId: "missing", ordinal: 1 },
    { siteId: "fixture-site", ordinal: 2 },
  ].entries()) {
    addRun(`node/unmatched-${index}`, fixtureRun(), (api, run) =>
      api.reduceNodeProgress(run, ref, { turn: 1 }),
    );
  }
  addRun(
    "node/duplicate-first-match",
    fixtureRun({ nodes: [fixtureNode(), fixtureNode({ turn: 3 })] }),
    (api, run) => api.reduceNodeProgress(run, { siteId: "fixture-site", ordinal: 1 }, { turn: 1 }),
  );
  for (const [index, payload] of [undefined, null, 1, [], "payload"].entries()) {
    add(`native/concurrency-${index}`, (api) =>
      api.reduceConcurrencyChanged(fixtureRun(), payload as unknown as Record<string, unknown>),
    );
    add(`native/phases-${index}`, (api) =>
      api.reduceRunLaunched(fixtureRun(), payload as unknown as Record<string, unknown>),
    );
    add(`native/node-${index}`, (api) =>
      api.reduceNodeProgress(
        fixtureRun(),
        { siteId: "fixture-site", ordinal: 1 },
        payload as unknown as Record<string, unknown>,
      ),
    );
  }
  return cases;
}
