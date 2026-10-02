import type { RuntimeMessageEntry } from "../../agent/message-history.js";
import { CompactTrigger, TurnMachineImpl, traceContextToLogContext } from "../deps.js";
import { createCompactRapidRefillError } from "../helpers/index.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { evaluateRapidRefill, MAX_CONSECUTIVE_RAPID_REFILLS, RAPID_REFILL_TOOL_TURN_THRESHOLD,
  recordCompactHistoryRound, recordCompactSuccess, type RegularTurnLoopState } from "./turn-loop-state.js";

export async function recoverTurnModelContext(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  contextError: unknown,
  modelStepIndex: number,
  requestEntries: readonly RuntimeMessageEntry[],
): Promise<boolean> {
  if (state.reactiveCompactAttemptedInCurrentModelStep) return false;
  const decision = evaluateRapidRefill(state.compactTracking);
  if (decision.shouldBlock) {
    runtime.logger?.warn("Reactive compact rapid-refill breaker tripped", {
      ...traceContextToLogContext(state.turnTraceContext),
      event: "compact.rapid_refill_breaker",
      consecutiveRapidRefills: decision.consecutiveRapidRefills,
      modelStepIndex,
      module: "core.runtime",
      status: "failed",
      toolTurnsSinceCompact: decision.toolTurnsSinceCompact,
      trigger: CompactTrigger.Reactive,
    });
    throw createCompactRapidRefillError({
      consecutiveRapidRefills: decision.consecutiveRapidRefills,
      maxConsecutiveRapidRefills: MAX_CONSECUTIVE_RAPID_REFILLS,
      toolTurnThreshold: RAPID_REFILL_TOOL_TURN_THRESHOLD,
      toolTurnsSinceCompact: decision.toolTurnsSinceCompact,
    });
  }
  state.reactiveCompactAttemptedInCurrentModelStep = true;
  const outcome = await runtime.reactiveCompactAfterContextExceeded(
    contextError, state.turnTraceContext, state.events, state.turnAbortSignal,
    {
      activeEntries: requestEntries,
      modelStepIndex,
      rapidRefillCount: decision.consecutiveRapidRefills,
      model: state.model,
      turnRequestState: state.turnRequestState,
    },
  );
  if (outcome !== "compacted") return false;
  recordCompactSuccess(state, decision);
  recordCompactHistoryRound(state);
  state.turnMachine = TurnMachineImpl.create(
    runtime.sessionId, runtime.turnNumber, state.input, state.traceId, state.turnId,
  );
  state.turnMachine.start();
  return true;
}
