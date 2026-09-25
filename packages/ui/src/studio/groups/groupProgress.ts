import type {
  StudioKernelId,
  StudioRun,
  StudioStepResult,
  StudioTimeline,
} from "@knorvia/services";

export type GroupProgressState =
  | "queued"
  | "running"
  | "waiting"
  | "stopping"
  | "completed"
  | "failed"
  | "blocked"
  | "stopped"
  | "unknown"
  | "unassigned";

export interface GroupTaskProgress {
  id: string;
  stepId: string;
  member: StudioKernelId;
  instruction: string;
  state: GroupProgressState;
  evidence?: Pick<StudioStepResult, "workspacePath" | "changesSummary">;
}

export interface GroupProgress {
  runId: string;
  runState: StudioRun["state"];
  phase: "planning" | "tasks" | "steering" | "reviewing" | "complete";
  round: number;
  host: StudioKernelId;
  members: Array<{ id: StudioKernelId; state: GroupProgressState; tasks: GroupTaskProgress[] }>;
  review?: { round: number; status: "complete" | "revise"; summary: string };
}

interface SavedPlan {
  round: number;
  phase: "tasks" | "steering" | "complete";
  tasks: Array<{ id: string; member: StudioKernelId; instruction: string; dependsOn?: string[] }>;
  review?: GroupProgress["review"];
}

function savedPlan(run: StudioRun): SavedPlan | undefined {
  const plan = run.checkpoint.plan;
  if (
    !plan ||
    typeof plan !== "object" ||
    !("version" in plan) ||
    plan.version !== 1 ||
    !("round" in plan) ||
    !Number.isSafeInteger(plan.round) ||
    (plan.round as number) < 0 ||
    !("phase" in plan) ||
    !["tasks", "steering", "complete"].includes(String(plan.phase)) ||
    !("tasks" in plan) ||
    !Array.isArray(plan.tasks)
  )
    return undefined;
  const definition = run.definition;
  if (!definition || !("members" in definition)) return undefined;
  const tasks = plan.tasks.filter(
    (task): task is SavedPlan["tasks"][number] =>
      task &&
      typeof task === "object" &&
      typeof task.id === "string" &&
      typeof task.instruction === "string" &&
      definition.members.includes(task.member),
  );
  const candidate = "review" in plan ? plan.review : undefined;
  const review =
    candidate &&
    typeof candidate === "object" &&
    "round" in candidate &&
    Number.isSafeInteger(candidate.round) &&
    "status" in candidate &&
    ["complete", "revise"].includes(String(candidate.status)) &&
    "summary" in candidate &&
    typeof candidate.summary === "string"
      ? (candidate as GroupProgress["review"])
      : undefined;
  return { round: plan.round as number, phase: plan.phase as SavedPlan["phase"], tasks, review };
}

function taskState(run: StudioRun, timeline: StudioTimeline, stepId: string): GroupProgressState {
  const turn = timeline.turns?.find(
    (item) => item.runId === run.id && item.stepId === stepId && item.attempt === run.attempt,
  );
  const pending =
    turn &&
    timeline.interactions.some(
      (item) => item.runId === run.id && item.turnId === turn.id && item.status === "pending",
    );
  if (
    turn?.state === "running" &&
    run.cancelRequested &&
    ["running", "waiting"].includes(run.state)
  )
    return "stopping";
  if (pending && ["running", "waiting"].includes(run.state)) return "waiting";
  if (
    turn?.state === "running" &&
    ["running", "waiting"].includes(run.state) &&
    !run.cancelRequested
  )
    return "running";
  const result = run.checkpoint.steps[stepId];
  if (
    result?.resultKnown === false ||
    result?.status === "interrupted" ||
    turn?.state === "interrupted"
  )
    return "unknown";
  if (result?.status === "succeeded" || turn?.state === "succeeded") return "completed";
  if (result?.status === "failed" || turn?.state === "failed") return "failed";
  if (result?.status === "cancelled" || turn?.state === "cancelled") return "stopped";
  if (turn?.state === "running" && run.resultKnown === false) return "unknown";
  if (turn?.state === "running" && run.state === "cancelled") return "stopped";
  return ["queued", "running", "waiting"].includes(run.state) && !run.cancelRequested
    ? "queued"
    : "unassigned";
}

function memberState(states: GroupProgressState[]): GroupProgressState {
  for (const state of [
    "unknown",
    "stopping",
    "waiting",
    "running",
    "failed",
    "blocked",
    "queued",
    "stopped",
    "completed",
  ] as const) {
    if (states.includes(state)) return state;
  }
  return "unassigned";
}

/** Read-only view of the latest persisted task-mode run. */
export function groupProgress(timeline?: StudioTimeline): GroupProgress | undefined {
  const run = timeline?.runs[0];
  if (
    !run ||
    !timeline ||
    run.kind !== "group" ||
    !run.taskMode ||
    !run.definition ||
    !("members" in run.definition)
  )
    return undefined;
  const definition = run.definition;
  const plan = savedPlan(run);
  const hostTurn = timeline.turns?.find(
    (turn) =>
      turn.runId === run.id &&
      turn.attempt === run.attempt &&
      /^group:(?:plan|review|steering):/.test(turn.stepId),
  );
  const hostWaiting =
    hostTurn &&
    timeline.interactions.some(
      (item) => item.runId === run.id && item.turnId === hostTurn.id && item.status === "pending",
    );
  const phase = !plan
    ? "planning"
    : plan.phase === "steering"
      ? "steering"
      : plan.phase === "complete"
        ? run.state === "queued"
          ? "steering"
          : "complete"
        : hostTurn?.state === "running" && hostTurn.stepId.startsWith("group:review:")
          ? "reviewing"
          : "tasks";
  const tasks: GroupTaskProgress[] = (plan?.tasks ?? []).map((task) => {
    const stepId = `group:round:${plan!.round}:task:${task.id}`;
    const step = run.checkpoint.steps[stepId];
    const currentState = taskState(run, timeline, stepId);
    const blocked =
      currentState === "queued" &&
      task.dependsOn?.some((id) => {
        const dependency = run.checkpoint.steps[`group:round:${plan!.round}:task:${id}`];
        return dependency && dependency.status !== "succeeded";
      });
    return {
      id: task.id,
      stepId,
      member: task.member,
      instruction: task.instruction,
      state: blocked ? "blocked" : currentState,
      ...(step?.workspacePath || step?.changesSummary
        ? { evidence: { workspacePath: step.workspacePath, changesSummary: step.changesSummary } }
        : {}),
    };
  });
  const members = definition.members.map((id) => {
    const assigned = tasks.filter((task) => task.member === id);
    const hostState: GroupProgressState | undefined =
      id !== definition.host
        ? undefined
        : hostTurn?.state === "running"
          ? run.cancelRequested && ["running", "waiting"].includes(run.state)
            ? "stopping"
            : run.state === "interrupted" || run.resultKnown === false
              ? "unknown"
              : hostWaiting
                ? "waiting"
                : "running"
          : hostTurn?.state === "succeeded"
            ? "completed"
            : hostTurn?.state === "failed"
              ? "failed"
              : hostTurn?.state === "cancelled"
                ? "stopped"
                : hostTurn?.state === "interrupted" || run.state === "interrupted"
                  ? "unknown"
                  : !plan && run.state === "queued"
                    ? "queued"
                    : !plan && run.state === "failed"
                      ? "failed"
                      : undefined;
    return {
      id,
      state: memberState([
        ...assigned.map((task) => task.state),
        ...(hostState ? [hostState as GroupProgressState] : []),
      ]),
      tasks: assigned,
    };
  });
  return {
    runId: run.id,
    runState: run.state,
    phase,
    round: plan?.round ?? 0,
    host: definition.host,
    members,
    review: plan?.review,
  };
}
