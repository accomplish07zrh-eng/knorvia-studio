// SPDX-License-Identifier: Apache-2.0

import type { EngineState, RunSettlement } from "./engine-state.js";
import type { RunEvent, RunSettlementRecord, RunStopReason } from "./types.js";
import { WorkflowError } from "./types.js";

// 执行终态持久化、事件分发、驱动释放与 promise 决议的统筹器
function commitTerminalSettlement(
  engine: EngineState,
  outcome: RunSettlement,
  record?: RunSettlementRecord,
): void {
  const currentRun = engine.runId;
  const targetStatus = outcome.status;

  engine.journal.updateRunStatus(currentRun, targetStatus, record);

  const settleEvent: Record<string, unknown> = {
    type: "run-settled",
    status: targetStatus,
  };

  const reason = record?.stopReason;
  if (reason !== undefined) {
    settleEvent.stopReason = reason;
  }
  const nextRun = record?.supersededBy;
  if (nextRun !== undefined) {
    settleEvent.supersededBy = nextRun;
  }
  const failDetails = record?.failure;
  if (failDetails !== undefined) {
    settleEvent.error = failDetails;
  }

  engine.record(settleEvent as RunEvent);

  const releaseDriver = engine.driver.dispose;
  if (typeof releaseDriver === "function") {
    releaseDriver.call(engine.driver);
  }

  engine.resolveSettled(outcome);
}

// 首次终态竞争锁守卫：已被其他路径结算则静默放弃
function tryAcquireSettlementLock(targetState: EngineState, failureCause?: WorkflowError): boolean {
  if (targetState.isRunSettled()) {
    return false;
  }
  targetState.markSettled(failureCause);
  return true;
}

// 沙箱脚本正常完成并交付顶层产物
export function settleCompleted(state: EngineState, artifact: unknown): void {
  if (!tryAcquireSettlementLock(state)) {
    return;
  }

  const abandonNotice = new WorkflowError(
    "Cancelled",
    "Run completed; in-flight subagent tasks were abandoned.",
  );
  state.abortInFlight(abandonNotice, true);

  commitTerminalSettlement(state, { status: "completed", artifact }, { result: artifact });
}

// 宿主、用户、模型端主动或受阻停止
export function settleStopped(
  state: EngineState,
  reason: RunStopReason,
  error?: WorkflowError,
  supersededBy?: string,
): void {
  if (!tryAcquireSettlementLock(state)) {
    return;
  }

  const stopNotice = new WorkflowError("Cancelled", "Run stopped.");
  state.abortInFlight(stopNotice, true);

  const stopRec: RunSettlementRecord = { stopReason: reason };
  if (supersededBy !== undefined) stopRec.supersededBy = supersededBy;
  if (error !== undefined) stopRec.failure = error.toJSON();

  const outcome: RunSettlement = {
    reason,
    status: "stopped",
    ...(supersededBy !== undefined ? { supersededBy } : {}),
    ...(error !== undefined ? { error } : {}),
  };

  commitTerminalSettlement(state, outcome, stopRec);
}

// 脚本执行期遭遇致命硬错误
export function settleFailed(state: EngineState, error: WorkflowError): void {
  if (!tryAcquireSettlementLock(state, error)) {
    return;
  }

  state.abortInFlight(error, Boolean(false));

  commitTerminalSettlement(state, { error, status: "errored" }, { failure: error.toJSON() });
}
