// Source-exposed clause programs; fixed prose and compatibility glue retain existing attribution.
import type { GetWorkflowRunOutput } from "@knorvia/contracts";
import {
  formatRelativeAge,
  formatWorkflowRunCount,
  formatWorkflowRunDuration,
} from "./workflow-run-introspection.js";

type Context = { run: Omit<GetWorkflowRunOutput, "summary">; now: number; terminal: boolean };
type Fragment<F> = string | ((frame: F) => unknown);
type Projection<F> = readonly Fragment<F>[] | (() => string | undefined) | undefined;
type Decision<F> = readonly [(frame: F) => boolean, (frame: F) => Projection<F>];

// 每次调用只创建自己的 frame；选中路线后才按片段顺序读取和转换，不能提前收集所有字段。
function program<I, F>(
  seed: (input: I) => F,
  decisions: readonly Decision<F>[],
  otherwise: (frame: F) => Projection<F>,
) {
  return (input: I): string | undefined => {
    const frame = seed(input);
    let project = otherwise;
    for (const [accepts, selected] of decisions) {
      if (!accepts(frame)) continue;
      project = selected;
      break;
    }
    const projection = project(frame);
    if (projection === undefined) return undefined;
    if (typeof projection === "function") return projection();
    let text = "";
    for (const fragment of projection)
      text += typeof fragment === "function" ? `${fragment(frame)}` : fragment;
    return text;
  };
}
const context = (input: Context) => input;
const absent = () => undefined;
const empty = () => [];

// 有序候选逐次读同一属性；合并成一次读会改变会变动或会抛错的 getter 的合同。
function stateIndex(value: { state: string }, choices: readonly string[]): number {
  for (let index = 0; index < choices.length; index++)
    if (value.state === choices[index]) return index;
  return -1;
}
const ACTIVE_PHASE_STATES = ["current", "unfinished"];
const OCCUPANCY_STATES = ["executing", "waiting", "parked"];
function occupancy(frame: Context): string {
  const { run } = frame;
  const counts = OCCUPANCY_STATES.map(() => 0);
  for (const actor of run.subagents) {
    const index = stateIndex(actor, OCCUPANCY_STATES);
    if (index >= 0) counts[index]! += 1;
  }
  let text = "";
  for (let index = 0; index < counts.length; index++) {
    if (counts[index]! <= 0) continue;
    text += `${text.length === 0 ? "" : ", "}${counts[index]} ${OCCUPANCY_STATES[index]}`;
  }
  return text.length === 0 ? "" : ` (${text})`;
}

const status = program(
  (input: Context) => ({
    ...input,
    elapsed: formatWorkflowRunDuration(input.run.updatedAt - input.run.createdAt),
  }),
  [
    [(f) => !f.terminal && f.run.status === "pending", () => ["Pending, not dispatched yet"]],
    [
      (f) => !f.terminal,
      () => ["Running for ", (f) => formatWorkflowRunDuration(f.now - f.run.createdAt)],
    ],
    [(f) => f.run.status === "completed", () => ["Completed in ", (f) => f.elapsed]],
    [(f) => f.run.status === "errored", () => ["Errored after ", (f) => f.elapsed]],
  ],
  (f) => {
    const reason = f.run.stopReason === undefined ? "stopped" : f.run.stopReason;
    const age = formatRelativeAge(f.now, f.run.updatedAt);
    return [
      "Stopped (",
      () => reason,
      ")",
      age === undefined ? "" : ` ${age}`,
      " after ",
      f.elapsed,
    ];
  },
);

const phasePosition = program(
  (input: { phases: NonNullable<GetWorkflowRunOutput["phases"]> }) => {
    const phases = input.phases;
    const index = phases.findIndex((phase) => stateIndex(phase, ACTIVE_PHASE_STATES) >= 0);
    return { phases, index };
  },
  [
    [
      (f) => f.index < 0,
      () => [
        ", across ",
        (f) => f.phases.length,
        " phase",
        (f) => (f.phases.length === 1 ? "" : "s"),
      ],
    ],
  ],
  () => [
    ", in phase ",
    (f) => f.index + 1,
    " of ",
    (f) => f.phases.length,
    " (",
    (f) => f.phases[f.index]!.name,
    ")",
  ],
);
const phase = program(
  (input: Context) => ({ phases: input.run.phases }),
  [[(f) => f.phases === undefined || f.phases.length === 0, empty]],
  (f) => () => phasePosition({ phases: f.phases! }),
);

const failedSuffix = program(
  context,
  [[(f) => f.run.usage.nodesFailed > 0, () => [", ", (f) => f.run.usage.nodesFailed, " failed"]]],
  empty,
);
const runningSuffix = program(
  context,
  [
    [
      (f) => f.run.usage.nodesRunning > 0,
      () => [", ", (f) => f.run.usage.nodesRunning, " running", occupancy],
    ],
  ],
  empty,
);
const steps = program(
  (input: Context) => ({
    ...input,
    settled: input.run.usage.nodesCompleted + input.run.usage.nodesFailed,
    leftover: input.run.health.leftoverRunning,
  }),
  [
    [
      (f) => f.terminal && f.leftover !== undefined && f.leftover > 0,
      () => [
        (f) => f.settled,
        " of ",
        (f) => f.run.usage.nodesObserved,
        " dispatched steps settled; ",
        (f) => f.leftover,
        " ",
        (f) => (f.leftover === 1 ? "was" : "were"),
        " still running when the owning process exited and will be re-dispatched on resume",
      ],
    ],
    [
      (f) => f.terminal,
      (f) => {
        const failed = failedSuffix(f);
        return [
          (f) => f.settled,
          " step",
          (f) => (f.settled === 1 ? "" : "s"),
          " settled",
          () => failed,
          ", ",
          (f) => formatWorkflowRunCount(f.run.usage.spentTokens),
          " tokens",
        ];
      },
    ],
  ],
  (f) => {
    const running = runningSuffix(f);
    return [
      (f) => f.settled,
      " of ",
      (f) => f.run.usage.nodesObserved,
      " dispatched steps settled",
      () => running,
    ];
  },
);

const questionCount = program(
  (input: Context) => ({ count: input.run.pendingQuestions?.length ?? 0 }),
  [[(f) => f.count === 0, absent]],
  () => [(f) => f.count, " question", (f) => (f.count === 1 ? "" : "s"), " awaiting your answer."],
);
const questions = program(
  context,
  [
    [
      (f) => !f.run.health.pendingQuestionsKnown,
      () => ["Pending questions are unknown from this session."],
    ],
  ],
  (f) => () => questionCount(f),
);

const progressAge = program(
  (input: Context) => ({
    ...input,
    age: formatRelativeAge(input.now, input.run.health.lastProgressAt),
  }),
  [
    [(f) => f.age === undefined, absent],
    [(f) => f.run.health.stalledSince === undefined, () => ["Last progress ", (f) => f.age, "."]],
  ],
  () => ["Stalled, last progress ", (f) => f.age, "."],
);
const progress = program(context, [[(f) => f.terminal, absent]], (f) => () => progressAge(f));
const failure = program(
  context,
  [
    [(f) => f.run.error === undefined, absent],
    [(f) => f.run.status !== "errored" && f.run.stopReason !== "provider", absent],
  ],
  () => ["Failure: ", (f) => f.run.error!.code, "."],
);

const primaryArtifact = program(
  (input: Context) => {
    const { run } = input;
    const primary = run.artifacts?.find((artifact) => artifact.primary === true);
    return { primary };
  },
  [[(f) => f.primary === undefined, absent]],
  () => [
    "Deliverable: ",
    (f) => f.primary!.title ?? f.primary!.id,
    " (",
    (f) => f.primary!.kind,
    ", primary).",
  ],
);
const deliverable = program(
  context,
  [[(f) => f.run.status !== "completed", absent]],
  (f) => () => primaryArtifact(f),
);
const ownership = program(context, [[(f) => f.run.ownedByThisSession, absent]], () => [
  "Owned by another session.",
]);
const CLAUSES = { status, phase, steps, questions, progress, failure, deliverable, ownership };

export function readWorkflowSummaryClause(
  clause: keyof typeof CLAUSES,
  run: Context["run"],
  now = 0,
  terminal = false,
): string | undefined {
  return CLAUSES[clause]({ run, now, terminal });
}
