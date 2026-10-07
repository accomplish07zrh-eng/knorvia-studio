import { redactDiagnosticText } from "@knorvia/shared";
import type {
  StudioAgentArtifactRef,
  StudioAgentEvent,
  StudioAgentPolicy,
  StudioAgentResultRef,
  StudioAgentTask,
} from "../agentToolTypes.js";
import type { StudioMessage, StudioTurnSnapshot } from "../types.js";
import type { StudioStepResult } from "../workflowTypes.js";
import { studioAgentState } from "../domain/agentToolPolicy.js";
import type { StoredRun, StudioClock, StudioRepository } from "./storePort.js";

export interface StudioAgentRunLink {
  taskId: string;
  deadlineAt: number;
}
/** Durable ownership survives a user-approved parent resume; grants remain attempt-fenced. */
export const agentCallerKey = (callerId: string) => callerId;

export function studioAgentWorkspace(
  db: StudioRepository,
  runId: string,
): StudioAgentTask["workspace"] | undefined {
  const link = db.read<StudioAgentRunLink>("agent-run-link", runId);
  return link ? db.read<StudioAgentTask>("agent-task", link.taskId)?.workspace : undefined;
}
export function saveStudioAgentArtifacts(
  db: StudioRepository,
  run: StoredRun,
  stepId: string,
  artifacts: StudioAgentArtifactRef[],
): void {
  if (studioAgentWorkspace(db, run.id))
    db.write(
      "agent-artifacts",
      `${run.id}:${run.attempt}:${stepId}`,
      { attempt: run.attempt, artifacts },
      run.id,
    );
}

/** Called inside the executor's state transaction; no second mutable run state. */
export function recordStudioAgentEvent(
  db: StudioRepository,
  clock: StudioClock,
  run: StoredRun,
  interactionId?: string,
): void {
  const link = db.read<StudioAgentRunLink>("agent-run-link", run.id);
  if (!link) return;
  if (db.read<StoredRun>("run", run.id)?.attempt !== run.attempt) return;
  const task = db.read<StudioAgentTask>("agent-task", link.taskId);
  if (!task) return;
  if (["queued", "running"].includes(run.state)) return;
  if (run.state === "waiting" && !interactionId) return;
  const key = `${run.id}:${run.attempt}:${interactionId ?? "terminal"}`;
  const id = `ae:${key}`;
  if (db.read("agent-event", id)) return;
  const state = studioAgentState(run);
  const stepIds = new Set([
    ...Object.keys(run.checkpoint.steps),
    ...db.list<StudioTurnSnapshot>("turn", { scope: run.id, all: true }).map((turn) => turn.stepId),
  ]);
  const steps: StudioAgentResultRef["steps"] = [];
  for (const stepId of stepIds) {
    const result = db.read<StudioStepResult>("step-result", `${run.id}:${stepId}`);
    if (!result) continue;
    const resultId = clock.id();
    db.write("agent-result-step", resultId, result);
    steps.push({ stepId, resultId });
  }
  const resultRef: StudioAgentResultRef = {
    id: `ar:${key}`,
    taskId: task.id,
    runId: run.id,
    attempt: run.attempt,
    state,
    error: run.error ? redactDiagnosticText(run.error) : undefined,
    resultKnown: run.resultKnown,
    steps,
    artifacts: db
      .list<{ attempt: number; artifacts: StudioAgentArtifactRef[] }>("agent-artifacts", {
        scope: run.id,
        all: true,
      })
      .filter((entry) => entry.attempt === run.attempt)
      .flatMap((entry) => entry.artifacts),
    workspaces: db
      .list<{ runId: string; stepId: string; path: string }>("workspace", {
        scope: run.id,
        all: true,
      })
      .map(({ runId, stepId, path }) => ({ runId, stepId, path })),
  };
  const scope = agentCallerKey(task.parentCallerId);
  db.write("agent-result", resultRef.id, resultRef, scope);
  const event: StudioAgentEvent = {
    id,
    taskId: task.id,
    runId: run.id,
    attempt: run.attempt,
    state,
    resultRef,
    delivery: "pending",
    deliveries: 0,
    retryAt: clock.now(),
    createdAt: clock.now(),
  };
  db.write("agent-event", id, event, scope);
  const parent = db.read<StoredRun>("run", task.parentRunId);
  if (parent)
    db.write<StudioMessage>(
      "message",
      id,
      {
        id,
        runId: parent.id,
        targetId: parent.targetId,
        sender: "system",
        kind: "progress",
        text: `Studio Agent ${task.id}: ${state}\n${JSON.stringify({ eventId: id, runId: run.id, attempt: run.attempt, resultId: resultRef.id })}`,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      },
      parent.targetId,
    );
}

export function receiveStudioAgentEvents(
  db: StudioRepository,
  clock: StudioClock,
  scope: string,
  policy: StudioAgentPolicy,
): StudioAgentEvent[] {
  return db.transaction(() => {
    const sent: StudioAgentEvent[] = [];
    for (const event of db.list<StudioAgentEvent>("agent-event", {
      scope,
      all: true,
      oldestFirst: true,
    })) {
      if (
        event.delivery === "acked" ||
        event.delivery === "exhausted" ||
        event.retryAt > clock.now()
      )
        continue;
      if (event.deliveries >= policy.deliveryAttempts) {
        db.write("agent-event", event.id, { ...event, delivery: "exhausted" }, scope);
        continue;
      }
      const next: StudioAgentEvent = {
        ...event,
        delivery: "sent",
        deliveries: event.deliveries + 1,
        retryAt: clock.now() + policy.retryMs,
      };
      db.write("agent-event", event.id, next, scope);
      sent.push(next);
    }
    return sent;
  });
}

export function enforceStudioAgentDeadlines(
  db: StudioRepository,
  clock: StudioClock,
  policy: StudioAgentPolicy,
): void {
  db.transaction(() => {
    for (const active of db.list<{ id: string }>("active", { all: true })) {
      const link = db.read<StudioAgentRunLink>("agent-run-link", active.id);
      if (!link) continue;
      const run = db.read<StoredRun>("run", active.id);
      if (
        !run ||
        run.cancelRequested ||
        (clock.now() < link.deadlineAt && run.attempt <= policy.maxAttempts)
      )
        continue;
      run.cancelRequested = true;
      run.error = "Studio Agent 达到运行时间或重试上限，请由用户检查结果";
      if (run.state === "queued") {
        run.state = "cancelled";
        run.resultKnown = true;
        db.remove("active", run.id);
      }
      db.write("run", run.id, run, run.targetId);
      recordStudioAgentEvent(db, clock, run);
    }
  });
}
