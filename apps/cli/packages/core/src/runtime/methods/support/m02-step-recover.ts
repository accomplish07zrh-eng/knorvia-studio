// SPDX-License-Identifier: Apache-2.0
// 反应式上下文恢复。每个模型步只尝试一次；熔断直接抛，不再压缩。
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import { CompactTrigger, TurnMachineImpl, traceContextToLogContext } from "../../deps.js";
import { createCompactRapidRefillError } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { assignKeys, report } from "./m02-record.js";
import {
  evaluateRapidRefill,
  MAX_CONSECUTIVE_RAPID_REFILLS,
  RAPID_REFILL_TOOL_TURN_THRESHOLD,
  recordCompactHistoryRound,
  recordCompactSuccess,
  type RapidRefillDecision,
  type RegularTurnLoopState,
} from "./m02-loop-state.js";

function breakerFields(
  loop: RegularTurnLoopState,
  verdict: RapidRefillDecision,
  stepIndex: number,
) {
  const traced = traceContextToLogContext(loop.turnTraceContext);
  const extra = assignKeys<Record<string, unknown>>([
    ["event", "compact.rapid_refill_breaker"],
    ["consecutiveRapidRefills", verdict.consecutiveRapidRefills],
    ["modelStepIndex", stepIndex],
    ["module", "core.runtime"],
    ["status", "failed"],
    ["toolTurnsSinceCompact", verdict.toolTurnsSinceCompact],
    ["trigger", CompactTrigger.Reactive],
  ]);
  return { ...traced, ...extra };
}

function refillError(verdict: RapidRefillDecision) {
  return createCompactRapidRefillError(
    assignKeys([
      ["consecutiveRapidRefills", verdict.consecutiveRapidRefills],
      ["maxConsecutiveRapidRefills", MAX_CONSECUTIVE_RAPID_REFILLS],
      ["toolTurnThreshold", RAPID_REFILL_TOOL_TURN_THRESHOLD],
      ["toolTurnsSinceCompact", verdict.toolTurnsSinceCompact],
    ]),
  );
}

function restartMachine(host: AgentRuntimeInternal, loop: RegularTurnLoopState): void {
  const opened = TurnMachineImpl.create(
    host.sessionId,
    host.turnNumber,
    loop.input,
    loop.traceId,
    loop.turnId,
  );
  loop.turnMachine = new TurnMachineImpl(opened.start());
}

export async function recoverTurnModelContext(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  failure: unknown,
  stepIndex: number,
  entries: readonly RuntimeMessageEntry[],
): Promise<boolean> {
  if (loop.reactiveCompactAttemptedInCurrentModelStep) return false;
  const verdict = evaluateRapidRefill(loop.compactTracking);
  if (verdict.shouldBlock === true) {
    report(
      host,
      "warn",
      "Reactive compact rapid-refill breaker tripped",
      breakerFields(loop, verdict, stepIndex),
    );
    throw refillError(verdict);
  }
  loop.reactiveCompactAttemptedInCurrentModelStep = true;
  const packed = assignKeys([
    ["activeEntries", entries],
    ["modelStepIndex", stepIndex],
    ["rapidRefillCount", verdict.consecutiveRapidRefills],
    ["model", loop.model],
    ["turnRequestState", loop.turnRequestState],
  ]);
  const outcome = await host.reactiveCompactAfterContextExceeded(
    failure,
    loop.turnTraceContext,
    loop.events,
    loop.turnAbortSignal,
    packed as never,
  );
  const accepted = outcome === "compacted";
  if (accepted) {
    recordCompactSuccess(loop, verdict);
    recordCompactHistoryRound(loop);
    restartMachine(host, loop);
  }
  return accepted;
}
