// SPDX-License-Identifier: Apache-2.0
// 反应式上下文恢复。每个模型步只尝试一次；熔断直接抛，不再压缩。
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import { CompactTrigger, TurnMachineImpl, traceContextToLogContext } from "../../deps.js";
import { createCompactRapidRefillError } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { assignKeys, phrase, report } from "./m02-record.js";
import {
  evaluateRapidRefill,
  MAX_CONSECUTIVE_RAPID_REFILLS,
  RAPID_REFILL_TOOL_TURN_THRESHOLD,
  recordCompactHistoryRound,
  recordCompactSuccess,
  type RapidRefillDecision,
  type RegularTurnLoopState,
} from "./m02-loop-state.js";

function breakerLog(
  state: RegularTurnLoopState,
  decision: RapidRefillDecision,
  modelStepIndex: number,
) {
  const traced = traceContextToLogContext(state.turnTraceContext);
  const extra = assignKeys<Record<string, unknown>>([
    ["event", phrase(["compact.", "rapid_refill_breaker"])],
    ["consecutiveRapidRefills", decision.consecutiveRapidRefills],
    ["modelStepIndex", modelStepIndex],
    ["module", "core.runtime"],
    ["status", "failed"],
    ["toolTurnsSinceCompact", decision.toolTurnsSinceCompact],
    ["trigger", CompactTrigger.Reactive],
  ]);
  return { ...traced, ...extra };
}

function refillError(decision: RapidRefillDecision) {
  return createCompactRapidRefillError(
    assignKeys([
      ["consecutiveRapidRefills", decision.consecutiveRapidRefills],
      ["maxConsecutiveRapidRefills", MAX_CONSECUTIVE_RAPID_REFILLS],
      ["toolTurnThreshold", RAPID_REFILL_TOOL_TURN_THRESHOLD],
      ["toolTurnsSinceCompact", decision.toolTurnsSinceCompact],
    ]),
  );
}

function restartMachine(runtime: AgentRuntimeInternal, state: RegularTurnLoopState): void {
  const opened = TurnMachineImpl.create(runtime.sessionId, runtime.turnNumber, state.input, state.traceId, state.turnId);
  state.turnMachine = new TurnMachineImpl(opened.start());
}

export async function recoverTurnModelContext(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, contextError: unknown, modelStepIndex: number, requestEntries: readonly RuntimeMessageEntry[]): Promise<boolean> {
  if (state.reactiveCompactAttemptedInCurrentModelStep === true) return false;
  const trackingNow = state.compactTracking;
  const decision = evaluateRapidRefill(trackingNow);
  if (decision.shouldBlock === true) {
    report(runtime, "warn", phrase(["Reactive compact ", "rapid-refill breaker tripped"]), breakerLog(state, decision, modelStepIndex));
    throw refillError(decision);
  }
  state.reactiveCompactAttemptedInCurrentModelStep = true;
  const loopContext = assignKeys([
    ["activeEntries", requestEntries],
    ["modelStepIndex", modelStepIndex],
    ["rapidRefillCount", decision.consecutiveRapidRefills],
    ["model", state.model],
    ["turnRequestState", state.turnRequestState],
  ]);
  const outcome = await runtime.reactiveCompactAfterContextExceeded(contextError, state.turnTraceContext, state.events, state.turnAbortSignal, loopContext as never);
  if (outcome === "compacted") {
    recordCompactSuccess(state, decision);
    recordCompactHistoryRound(state);
    restartMachine(runtime, state);
    return true;
  }
  return false;
}
