// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 调用方上下文的解析：MCP 请求的 `_meta` 里可能带一个上下文对象，
// 本模块只从中取两个字段，其余原样保留给执行器做 requestMeta。
import { z } from "zod";

/** 调用方上下文在 MCP 元数据里的键。 */
export const CONTEXT_META_KEY = "com.knorvia-studio/request-context";

/**
 * 运行时范围的取值域。
 *
 * 只允许这两个值：`main` 表示主会话（可用浏览器），`subagent` 表示子代理
 * （按协议不得使用浏览器）。集合本身是协议的一部分，不要就地内联。
 */
const RUNTIME_SCOPES = ["main", "subagent"] as const;

/** 一个会话 id：非空、去首尾空白后的字符串。 */
const sessionIdField = z.string().trim().min(1);

/** 运行时范围字段：缺席时按主会话处理（历史调用方不带这个字段）。 */
const runtimeScopeField = z.enum(RUNTIME_SCOPES).default("main");

/**
 * 调用方上下文的形状。
 *
 * `catchall` 是刻意的：客户端可以带额外字段，本包只关心
 * `runtime_scope` 与 `session_id`，其余原样传给执行器。
 */
const callerContextSchema = z
  .object({ runtime_scope: runtimeScopeField, session_id: sessionIdField.optional() })
  .catchall(z.unknown());

/** 解析成功时的结果类型。 */
type CallerContext = z.infer<typeof callerContextSchema>;

/**
 * 把调用方元数据解析成 requestMeta。
 *
 * 解析失败不向上抛：元数据只是补充信息，缺了它最坏是少一个字段，
 * 不该让整次工具调用失败。返回空对象即「当作没带上下文」。
 *
 * @param rawContext - MCP 请求里携带的原始上下文。
 * @returns 已归一化的元数据。
 */
export function readCallerContext(rawContext: unknown): Record<string, unknown> {
  const outcome = callerContextSchema.safeParse(rawContext);
  if (!outcome.success) return {};
  const accepted: CallerContext = outcome.data;
  return accepted;
}

/**
 * 从已归一化的元数据里取会话 id。
 *
 * `safeParse` 的产出值域是 `unknown`，把「是不是字符串」这一判断集中在这里，
 * 调用点就不必各写一遍 `typeof`。
 *
 * @param meta - `readCallerContext` 的返回值。
 * @returns 会话 id；元数据里没有、或不是字符串时为 undefined。
 */
export function sessionIdOf(meta: Record<string, unknown>): string | undefined {
  const value = meta.session_id;
  const usable = typeof value === "string";
  return usable ? (value as string) : undefined;
}
