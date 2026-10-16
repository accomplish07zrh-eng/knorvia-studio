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
  state: RegularTurnLoopState, // m02
  decision: RapidRefillDecision, // m02
  modelStepIndex: number, // m02
) {
  // m02
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
  const opened = TurnMachineImpl.create(
    runtime.sessionId, // m02
    runtime.turnNumber, // m02
    state.input, // m02
    state.traceId, // m02
    state.turnId, // m02
  );
  state.turnMachine = new TurnMachineImpl(opened.start());
}

export async function recoverTurnModelContext(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  contextError: unknown, // m02
  modelStepIndex: number, // m02
  requestEntries: readonly RuntimeMessageEntry[], // m02
): Promise<boolean> {
  // m02
  if (state.reactiveCompactAttemptedInCurrentModelStep === true) return false;
  const trackingNow = state.compactTracking;
  const decision = evaluateRapidRefill(trackingNow);
  if (decision.shouldBlock === true) {
    report(
      // m02
      runtime, // m02
      "warn", // m02
      phrase(["Reactive compact ", "rapid-refill breaker tripped"]),
      breakerLog(state, decision, modelStepIndex),
    );
    throw refillError(decision);
  }
  state.reactiveCompactAttemptedInCurrentModelStep = true; // m02
  const loopContext = assignKeys([
    ["activeEntries", requestEntries],
    ["modelStepIndex", modelStepIndex],
    ["rapidRefillCount", decision.consecutiveRapidRefills],
    ["model", state.model],
    ["turnRequestState", state.turnRequestState],
  ]);
  const outcome = await runtime.reactiveCompactAfterContextExceeded(
    // m02
    contextError, // m02
    state.turnTraceContext, // m02
    state.events, // m02
    state.turnAbortSignal, // m02
    loopContext as never,
  );
  if (outcome === "compacted") {
    recordCompactSuccess(state, decision); // m02
    recordCompactHistoryRound(state); // m02
    restartMachine(runtime, state);
    return true; // m02
  }
  return false; // m02
}
