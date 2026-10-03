// SPDX-License-Identifier: Apache-2.0
// Source-exposed read-only fact projection authored from the lane contract; review pending.
import type { StudioKernelId, StudioRun, StudioTimeline } from "@knorvia/services";
import type { GroupProgress, GroupProgressState, GroupSavedPlan } from "./groupProgressTypes.js";

type Turn = NonNullable<StudioTimeline["turns"]>[number];
type Rule = readonly [boolean, GroupProgressState];

function objectFields(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function decodeGroupPlan(
  run: StudioRun,
  members: StudioKernelId[],
): GroupSavedPlan | undefined {
  const fields = objectFields(run.checkpoint.plan);
  if (
    !fields ||
    fields.version !== 1 ||
    !Number.isSafeInteger(fields.round) ||
    (fields.round as number) < 0
  )
    return undefined;
  if (
    !["tasks", "steering", "complete"].includes(String(fields.phase)) ||
    !Array.isArray(fields.tasks)
  )
    return undefined;
  const tasks: GroupSavedPlan["tasks"] = [];
  for (const item of fields.tasks) {
    const task = objectFields(item);
    if (!task || typeof task.id !== "string" || typeof task.instruction !== "string") continue;
    if (members.includes(task.member as StudioKernelId))
      tasks.push(item as GroupSavedPlan["tasks"][number]);
  }
  const candidate = objectFields(fields.review);
  const validReview =
    candidate !== null &&
    Number.isSafeInteger(candidate.round) &&
    ["complete", "revise"].includes(String(candidate.status)) &&
    typeof candidate.summary === "string";
  return {
    round: fields.round as number,
    phase: fields.phase as GroupSavedPlan["phase"],
    tasks,
    review: validReview ? (fields.review as GroupProgress["review"]) : undefined,
  };
}

export function collectGroupRunFacts(run: StudioRun, timeline: StudioTimeline) {
  const turns = new Map<string, Turn>();
  let host: Turn | undefined;
  for (const turn of timeline.turns ?? []) {
    if (turn.runId !== run.id || turn.attempt !== run.attempt) continue;
    if (!turns.has(turn.stepId)) turns.set(turn.stepId, turn);
    if (!host && /^group:(?:plan|review|steering):/.test(turn.stepId)) host = turn;
  }
  const pending = new Set<string>();
  for (const interaction of timeline.interactions) {
    if (interaction.runId === run.id && interaction.status === "pending")
      pending.add(interaction.turnId);
  }
  return { turns, host, pending };
}

export type GroupRunFacts = ReturnType<typeof collectGroupRunFacts>;

function firstState(rules: readonly Rule[]): GroupProgressState | undefined {
  return rules.find(([matches]) => matches)?.[1];
}

export function groupTaskState(
  run: StudioRun,
  facts: GroupRunFacts,
  stepId: string,
): GroupProgressState {
  const turn = facts.turns.get(stepId);
  const result = run.checkpoint.steps[stepId];
  const live = run.state === "running" || run.state === "waiting";
  const running = turn?.state === "running";
  return (
    firstState([
      [running && !!run.cancelRequested && live, "stopping"],
      [!!turn && facts.pending.has(turn.id) && live, "waiting"],
      [running && live && !run.cancelRequested, "running"],
      [
        result?.resultKnown === false ||
          result?.status === "interrupted" ||
          turn?.state === "interrupted",
        "unknown",
      ],
      [result?.status === "succeeded" || turn?.state === "succeeded", "completed"],
      [result?.status === "failed" || turn?.state === "failed", "failed"],
      [result?.status === "cancelled" || turn?.state === "cancelled", "stopped"],
      [running && run.resultKnown === false, "unknown"],
      [running && run.state === "cancelled", "stopped"],
      [(live || run.state === "queued") && !run.cancelRequested, "queued"],
    ]) ?? "unassigned"
  );
}

export function groupHostState(
  run: StudioRun,
  facts: GroupRunFacts,
  hasPlan: boolean,
): GroupProgressState | undefined {
  const host = facts.host;
  if (host?.state === "running") {
    return (
      firstState([
        [!!run.cancelRequested && (run.state === "running" || run.state === "waiting"), "stopping"],
        [run.state === "interrupted" || run.resultKnown === false, "unknown"],
        [facts.pending.has(host.id), "waiting"],
      ]) ?? "running"
    );
  }
  return firstState([
    [host?.state === "succeeded", "completed"],
    [host?.state === "failed", "failed"],
    [host?.state === "cancelled", "stopped"],
    [host?.state === "interrupted" || run.state === "interrupted", "unknown"],
    [!hasPlan && run.state === "queued", "queued"],
    [!hasPlan && run.state === "failed", "failed"],
  ]);
}

export function groupMemberState(states: Iterable<GroupProgressState>): GroupProgressState {
  const present = new Set(states);
  const priority: readonly GroupProgressState[] = [
    "unknown",
    "stopping",
    "waiting",
    "running",
    "failed",
    "blocked",
    "queued",
    "stopped",
    "completed",
  ];
  return priority.find((state) => present.has(state)) ?? "unassigned";
}

export function groupProgressPhase(
  run: StudioRun,
  plan: GroupSavedPlan | undefined,
  facts: GroupRunFacts,
): GroupProgress["phase"] {
  if (!plan) return "planning";
  if (plan.phase === "steering") return "steering";
  if (plan.phase === "complete") return run.state === "queued" ? "steering" : "complete";
  return facts.host?.state === "running" && facts.host.stepId.startsWith("group:review:")
    ? "reviewing"
    : "tasks";
}
