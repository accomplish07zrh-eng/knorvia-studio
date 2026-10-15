// SPDX-License-Identifier: Apache-2.0
// 回合失败与取消的兼容面（B30）：实现见 ./turn/abort-scope.js 与 ./turn/outcome-events.js。
import * as abortScope from "./turn/abort-scope.js";
import * as outcome from "./turn/outcome-events.js";

export const projectExecutionErrorPayload = outcome.projectExecutionErrorPayload;
export const createExternalTurnFaultError = abortScope.createExternalTurnFaultError;
export const createTurnAbortScope = abortScope.createTurnAbortScope;
export const throwIfTurnAborted = abortScope.throwIfTurnAborted;
export const createTurnFailureError = outcome.createTurnFailureError;
export const createTurnCancelledError = abortScope.createTurnCancelledError;
export const appendTurnOutcomeEvent = outcome.appendTurnOutcomeEvent;
export const isTurnCancellationError = abortScope.isTurnCancellationError;
