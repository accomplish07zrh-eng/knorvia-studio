import { beginLocalTurnPreparation } from "@knorvia/contracts";
import {
  traceContextToLogContext,
  type MessageId,
  type SessionEvent,
  type SessionGoal,
  type TurnState,
  type TurnMachineImpl,
} from "../deps.js";
import { createTurnAbortScope, parseRewindCommand } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { ActiveTurnSteeringState, ExecuteTurnOptions } from "../types.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";

export interface TurnCommandLifetime {
  runtime: AgentRuntimeInternal;
  input: string;
  attachments: TurnState["attachments"];
  options: ExecuteTurnOptions | undefined;
  selection: ReturnType<AgentRuntimeInternal["getSessionModelSelection"]>;
  outputStyle: AgentRuntimeInternal["config"]["outputStyle"];
  compact: ReturnType<typeof import("../helpers/index.js").parseCompactCommand>;
  rewind: ReturnType<typeof parseRewindCommand>;
  turnId: TurnState["id"];
  queryId: NonNullable<ExecuteTurnOptions["queryId"]>;
  displayInput: string;
  trace: AgentRuntimeInternal["rootTraceContext"];
  traceId: TurnState["traceId"];
  startedAt: number;
  accountingInputId: string;
  events: SessionEvent[];
  machine: TurnMachineImpl;
  abortScope: ReturnType<typeof createTurnAbortScope>;
  signal: AbortSignal;
  activeTurn: ActiveTurnSteeringState | undefined;
  target: SessionGoal | null;
  heartbeat: ReturnType<typeof setInterval> | undefined;
  userMessageId: MessageId | undefined;
  loop: RegularTurnLoopState | undefined;
  deferredTitle: boolean;
  phase: string;
  handled: boolean;
  preparation: ReturnType<typeof beginLocalTurnPreparation> | undefined;
}

export function startPhase(s: TurnCommandLifetime, phase: string): number {
  const stage =
    phase === "context_initialization"
      ? "context"
      : phase === "session_start_hooks" || phase === "user_prompt_hooks"
        ? "hooks"
        : phase === "session_persistence" ||
            phase === "turn_started_event" ||
            phase === "target_accounting"
          ? "persistence"
          : undefined;
  s.preparation = stage ? beginLocalTurnPreparation(s.trace, stage) : undefined;
  s.phase = phase;
  const start = Date.now();
  s.runtime.logger?.info("Turn phase started", {
    ...traceContextToLogContext(s.trace),
    event: "turn.phase.started",
    module: "core.runtime",
    phase,
    status: "started",
  });
  return start;
}

export function completePhase(s: TurnCommandLifetime, phase: string, start: number): void {
  s.preparation?.();
  s.runtime.logger?.info("Turn phase completed", {
    ...traceContextToLogContext(s.trace),
    durationMs: Date.now() - start,
    event: "turn.phase.completed",
    module: "core.runtime",
    phase,
    status: "completed",
  });
}

export function logTurnStarted(s: TurnCommandLifetime): void {
  s.runtime.logger?.info("Turn started", {
    ...traceContextToLogContext(s.trace),
    event: "turn.started",
    inputLength: s.input.length,
    module: "core.runtime",
    status: "started",
  });
}

export function logTurnCompleted(s: TurnCommandLifetime): void {
  s.runtime.logger?.info("Turn completed", {
    ...traceContextToLogContext(s.trace),
    durationMs: Date.now() - s.machine.state.startedAt.getTime(),
    event: "turn.completed",
    module: "core.runtime",
    status: "completed",
    toolCallCount: s.loop!.toolCallCount,
  });
}

export function logUnhandled(s: TurnCommandLifetime, error: unknown): void {
  s.runtime.logger?.warn("Turn execution escaped lifecycle handler", {
    ...traceContextToLogContext(s.trace),
    durationMs: Date.now() - s.startedAt,
    errorMessage: error instanceof Error ? error.message : String(error),
    event: "turn.lifecycle.unhandled_rejection",
    module: "core.runtime",
    phase: s.phase,
    status: "failed",
  });
}

export function installHeartbeat(s: TurnCommandLifetime): void {
  if (s.target && s.runtime.sessionStore?.heartbeatTargetRun) {
    s.heartbeat = setInterval(() => {
      s.runtime.trackResidencyBlockingWork(
        s.runtime.heartbeatTargetTurnAccounting({
          inputID: s.accountingInputId,
          seenAtMs: Date.now(),
          startedTarget: s.target,
          traceContext: s.trace,
        }),
      );
    }, 15000);
    if (typeof s.heartbeat === "object" && "unref" in s.heartbeat) s.heartbeat.unref();
  }
}
