// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：`session/requestRuntimePreferences` 反向请求（B11）。
//
// 与默认引擎逐码对齐的错误语义（Lead 2026-10-20 裁决，本源：旧
// `server-operations.ts` 的 `resolveSessionStartupPreferences`）：
//   -32601（宿主不认识该方法）→ 退化到本地默认值继续，不阻断 create
//   -32020（无客户端连接）    → 同上
//   -32022（超时）            → 抛出让 create 失败（warn 日志）
//   其它错误                  → 抛出让 create 失败
//
// 「超时也必须阻断」是有意的：否则 Host 侧真实超时会被静默变成「用默认偏好」，属于放宽行为。

import { sessionRuntimePreferencesResultSchema } from "@knorvia/shared";
import { LEGACY_ERROR_CODES } from "./errors.js";
import { LegacyHostRequestError, type HostRequestBook } from "./host-request-book.js";

/** 会话运行时偏好的超时（既有常量 `KNORVIA_SESSION_RUNTIME_PREFERENCES_REQUEST_TIMEOUT_MS`）。 */
export const RUNTIME_PREFERENCES_TIMEOUT_MS = 15_000;

/** 缺省模型上下文预算策略（与 shared 的 `DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY` 同值）。 */
const DEFAULT_MODEL_CONTEXT_BUDGET_STRATEGY = "preflight-v1" as const;

/** 会话/执行两类作用域（shared `sessionRuntimePreferencesScopeSchema` 的字面量）。 */
export type RuntimePreferencesScope = "runtime-materialization" | "user-execution";

/** Host 应答的运行时偏好。 */
export interface SessionRuntimePreferences {
  readonly nativeSearchEnhancementsEnabled: boolean;
  readonly memoryEnabled: boolean;
  readonly askUserQuestionAutoResolutionEnabled: boolean;
  readonly modelContextBudgetStrategy: typeof DEFAULT_MODEL_CONTEXT_BUDGET_STRATEGY;
}

/**
 * 退化默认值：宿主不认识该方法（-32601）或没有客户端（-32020）时使用。
 * 取值与默认引擎 fallback 一致（`nativeSearchEnhancementsEnabled: true`）。
 */
export const FALLBACK_RUNTIME_PREFERENCES: SessionRuntimePreferences = {
  nativeSearchEnhancementsEnabled: true,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
  modelContextBudgetStrategy: DEFAULT_MODEL_CONTEXT_BUDGET_STRATEGY,
};

export interface FetchRuntimePreferencesInput {
  readonly book: HostRequestBook;
  readonly sessionId: string;
  readonly scope: RuntimePreferencesScope;
  readonly trace?: Readonly<Record<string, unknown>>;
  readonly logger?: {
    warn(message: string, fields?: Record<string, unknown>): void;
    debug(message: string, fields?: Record<string, unknown>): void;
  };
}

/**
 * 取会话运行时偏好。错误分支逐码对齐默认引擎（见文件头注释）。
 *
 * @throws LegacyHostRequestError 超时（-32022）或其它非退化错误——调用方据此让 create 失败。
 */
export async function fetchSessionRuntimePreferences(
  input: FetchRuntimePreferencesInput,
): Promise<SessionRuntimePreferences> {
  try {
    const parsed = await input.book.request(
      "session/requestRuntimePreferences",
      { sessionId: input.sessionId, scope: input.scope },
      sessionRuntimePreferencesResultSchema,
      {
        timeoutMs: RUNTIME_PREFERENCES_TIMEOUT_MS,
        ...(input.trace !== undefined ? { trace: input.trace } : {}),
      },
    );
    input.logger?.debug("kernel.bridge.legacy.runtime-preferences.received", {
      sessionId: input.sessionId,
      scope: input.scope,
    });
    return {
      nativeSearchEnhancementsEnabled: parsed.nativeSearchEnhancementsEnabled,
      memoryEnabled: parsed.memoryEnabled,
      askUserQuestionAutoResolutionEnabled: parsed.askUserQuestionAutoResolutionEnabled,
      modelContextBudgetStrategy: DEFAULT_MODEL_CONTEXT_BUDGET_STRATEGY,
    };
  } catch (error) {
    if (error instanceof LegacyHostRequestError) {
      // 只对「宿主不认识该方法」与「没有客户端」退化；超时与其它错误继续抛。
      if (error.code === LEGACY_ERROR_CODES.clientRequestUnavailable || error.code === -32601) {
        input.logger?.debug("kernel.bridge.legacy.runtime-preferences.degraded", {
          sessionId: input.sessionId,
          scope: input.scope,
          code: error.code,
        });
        return FALLBACK_RUNTIME_PREFERENCES;
      }
      if (error.code === LEGACY_ERROR_CODES.clientRequestTimeout) {
        input.logger?.warn("kernel.bridge.legacy.runtime-preferences.timeout", {
          sessionId: input.sessionId,
          scope: input.scope,
          timeoutMs: RUNTIME_PREFERENCES_TIMEOUT_MS,
        });
      }
    }
    throw error;
  }
}
