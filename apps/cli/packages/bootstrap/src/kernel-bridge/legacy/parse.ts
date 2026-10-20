// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：统一参数校验入口。
//
// interface.md §六.1 要求「每个方法先用 @knorvia/shared 的既有 schema 校验参数，
// 失败回 -32602 + `Invalid params — <path>: <原因>` 文案结构」。所有处理器都从这里拿参数，
// 因此本包只有一处构造 -32602，弱化了「某方法忘了校验」的可能。

import type { z } from "zod";
import { LEGACY_METHOD_SCHEMAS } from "./contracts.js";
import { JSONRPC_INVALID_PARAMS, protocolError } from "./errors.js";
import type { LegacyMethodOutcome } from "./types.js";

/** 校验成功：得到 schema 输出（含 default 填充）。 */
export type ParsedParams<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly outcome: LegacyMethodOutcome };

/**
 * 按方法名查 schema 并校验参数。
 *
 * 方法不在表里是编码错误（表与 method-table 必须同步），抛错而不是静默放行——
 * 静默放行会让未校验的参数流进领域代码，属于协议边界漏洞。
 */
export function parseParams<T>(method: string, params: unknown): ParsedParams<T> {
  const entry = LEGACY_METHOD_SCHEMAS[method as keyof typeof LEGACY_METHOD_SCHEMAS];
  if (entry === undefined) {
    throw new Error(`kernel-bridge-legacy: no params schema registered for ${method}`);
  }
  const parsed = entry.params.safeParse(params);
  if (parsed.success) return { ok: true, value: parsed.data as T };
  return {
    ok: false,
    outcome: protocolError(
      JSONRPC_INVALID_PARAMS,
      `Invalid params — ${summarizeIssues(parsed.error)}`,
    ),
  };
}

/** 结果形状自检：结构性错误在开发期立刻暴露，不静默改写（interface.md §六.3）。 */
export function assertResultShape<T>(method: string, value: unknown, parsed: ParsedParams<T>): T {
  if (!parsed.ok) throw new Error(`kernel-bridge-legacy: ${method} result shape is invalid`);
  return parsed.value;
}

/** zod 诊断压成单行文案：路径 + 原因，最多 5 条，避免回显整份 payload。 */
function summarizeIssues(error: z.ZodError): string {
  const parts = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".");
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length > 5 ? ` (+${error.issues.length - 5} more)` : "";
  return parts.length === 0 ? "invalid parameters" : `${parts.join("; ")}${more}`;
}
