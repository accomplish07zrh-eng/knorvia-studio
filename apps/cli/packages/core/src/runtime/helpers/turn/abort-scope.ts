// SPDX-License-Identifier: Apache-2.0
// 回合取消作用域与取消判定（B30 的作用域半边）。
// 取消作用域：派生子 AbortController，父信号中止即级联中止（原因透传）；父已中止时立即为
// 中态；dispose 解除监听（不 dispose 只泄漏监听，不影响语义）。
// 取消判定：外部故障优先判为**非**取消（标记沿 abort 原因与错误两条链找，7 层防环）；
// 父信号已中止即取消；否则沿 cause 链找 TurnCancelled 类型/码、MODEL_REQUEST_CANCELLED、
// ABORT_ERR、AbortError。createTurnCancelledError 复用已有的 TurnCancelled 错误。
import { CoreErrorType, createCoreError, isCoreError } from "../../deps.js";

// 外部故障标记（协议面，逐字冻结）：knorviaTurnFault 字段值。
const EXTERNAL_FAULT_MARKER = "knorvia.externalTurnFault";

// 取消识别的固定码/名（协议面，逐字冻结）。
const CANCELLED_REQUEST_CODE = "MODEL_REQUEST_CANCELLED";
const CANCELLED_REQUEST_CODE_LOWER = "model_request_cancelled";
const ABORT_ERROR_CODE = "ABORT_ERR";
const ABORT_ERROR_NAME = "AbortError";

// 取消正文（逐字冻结）。
const CANCELLED_MESSAGE = "Turn was cancelled.";

export interface TurnAbortScope {
  dispose: () => void; // 解除父监听（幂等无害）
  signal: AbortSignal; // 派生的子信号
}

type ExternalTurnFault = Error & { code: string }; // 外部故障的形状

// 外部故障查找：沿 cause 链递归下钻，7 层（level 0..6）内找到带标记且有 code 的 Error。
function findExternalFault(error: unknown, level = 0): ExternalTurnFault | null {
  if (!error || typeof error !== "object" || level > 6) return null;
  const fields = error as Record<string, unknown>;
  const marked = fields.knorviaTurnFault === EXTERNAL_FAULT_MARKER;
  if (marked && typeof fields.code === "string" && error instanceof Error) {
    return error as ExternalTurnFault;
  }
  return findExternalFault(fields.cause, level + 1);
}

// 外部故障错误：message 缺省复用 code，标记字段供两条链识别。
export const createExternalTurnFaultError = (code: string, message: string = code): Error => {
  const fault = new Error(message);
  return Object.assign(fault, { code, knorviaTurnFault: EXTERNAL_FAULT_MARKER });
};

export const createTurnAbortScope = (upstream?: AbortSignal): TurnAbortScope => {
  const scopeController = new AbortController();
  const cascadeAbort = () => {
    if (!scopeController.signal.aborted) {
      scopeController.abort(upstream?.reason);
    }
  };
  if (upstream?.aborted) {
    cascadeAbort();
    return { dispose: () => {}, signal: scopeController.signal };
  }
  upstream?.addEventListener("abort", cascadeAbort, { once: true });
  return {
    dispose: () => upstream?.removeEventListener("abort", cascadeAbort),
    signal: scopeController.signal,
  };
};

// 已中止即抛 TurnCancelled（以抛出为正常返回）。
export const throwIfTurnAborted = (watch?: AbortSignal): void => {
  if (watch?.aborted) {
    throw createTurnCancelledError(watch.reason);
  }
};

export const createTurnCancelledError = (reason: unknown): ReturnType<typeof createCoreError> => {
  const alreadyCancelled = isCoreError(reason) && reason.type === CoreErrorType.TurnCancelled;
  if (alreadyCancelled) {
    return reason;
  }
  return createCoreError(CoreErrorType.TurnCancelled, CANCELLED_MESSAGE, {
    cause: reason instanceof Error ? reason : undefined,
    recoverable: true,
  });
};

// 取消判定：外部故障优先否决；信号已中止即取消；否则沿 cause 链递归找取消码/名。
export const isTurnCancellationError = (reason: unknown, aborted?: AbortSignal): boolean => {
  if (findExternalFault(aborted?.reason) || findExternalFault(reason)) {
    return false;
  }
  if (aborted?.aborted) {
    return true;
  }
  return walksCancelChain(reason, 0);
};

function walksCancelChain(node: unknown, level: number): boolean {
  if (node === undefined || node === null || typeof node !== "object" || level > 6) return false;
  if (isCoreError(node) && node.type === CoreErrorType.TurnCancelled) return true;
  const fields = node as Record<string, unknown>;
  const typeField = typeof fields.type === "string" ? fields.type : undefined;
  const codeField = typeof fields.code === "string" ? fields.code : undefined;
  const nameField = typeof fields.name === "string" ? fields.name : undefined;
  const cancelled =
    typeField === CoreErrorType.TurnCancelled ||
    codeField === CoreErrorType.TurnCancelled ||
    codeField === CANCELLED_REQUEST_CODE ||
    codeField === CANCELLED_REQUEST_CODE_LOWER ||
    codeField === ABORT_ERROR_CODE ||
    nameField === ABORT_ERROR_NAME;
  return cancelled ? true : walksCancelChain(fields.cause, level + 1);
}

// 供 outcome-events 使用的内部口径：外部故障在两条链上都算「非取消」。
export function locateExternalTurnFault(error: unknown): ExternalTurnFault | null {
  return findExternalFault(error);
}
