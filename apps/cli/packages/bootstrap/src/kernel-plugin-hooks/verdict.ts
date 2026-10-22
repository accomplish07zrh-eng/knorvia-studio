// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// kernel-plugin-hooks 的 Hook 执行器：把配置的 Hook 变成对 DSH 事件的决策。
//
// 设计要点（依据 specs/contracts/kernel-plugin-hooks/behavior.md §二）：
//   一、决策只在「有匹配 Hook 且执行成功」时产生；否则一律委托（不调 next 之外的返回值）。
//   二、Hook 失败不能改变主流程语义：执行失败按「无决策」处理并记 telemetry，
//       不把 Hook 的基础设施问题伪装成「用户拒绝」。
//   三、所有判断都走具名函数，便于测试定位到具体规则。
// 从主入口导入：contracts 的 `src/index.ts` 有 `export * from "./hooks/index.js"`，
// 而 `@knorvia/contracts/hooks` 子路径指向 dist（bootstrap 的 typecheck 不构建 contracts）。
import type { HookEventName } from "@knorvia/contracts";

/** 一次 Hook 执行的结果：要么给出决策，要么没有意见。 */
export type HookVerdict =
  | { readonly kind: "no-opinion" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "ask"; readonly reason: string }
  | { readonly kind: "allow" };

/** 无意见：最常见的返回值，代表「这个 Hook 不干预」。 */
export const NO_OPINION: HookVerdict = { kind: "no-opinion" };

/**
 * 把 Hook 的 stdout 判定转成裁决。
 *
 * `HookJSONOutput` 的 `hookSpecificOutput.permissionDecision` 是旧协议的表达方式：
 *   - `deny` → 阻断，reason 取 `permissionDecisionReason`
 *   - `ask`  → 要求审批，reason 同上
 *   - `allow` → 放行
 * 没有 `permissionDecision` 时视为无意见（Hook 只观察不干预）。
 *
 * 为什么不在这里抛错：Hook 的输出是**用户脚本**产生的，格式不对属于「这个 Hook 没给出
 * 有效意见」，不是本插件的配置错误。按无意见处理并记 telemetry 更符合「Hook 失败不改
 * 变主流程语义」的约定。
 */
export function verdictFromPermissionDecision(
  decision: "allow" | "deny" | "ask" | undefined,
  reason: string | undefined,
): HookVerdict {
  switch (decision) {
    case "deny":
      // DSH 的 deny 必须带 reason（PreToolDecision 的类型要求），
      // 用户没给时用固定文案，避免把「未提供」变成类型错误。
      return { kind: "deny", reason: reason ?? "denied by hook" };
    case "ask":
      return { kind: "ask", reason: reason ?? "approval required by hook" };
    case "allow":
      return { kind: "allow" };
    default:
      return NO_OPINION;
  }
}

/**
 * 判断某个事件名是否属于本插件负责的 7 种。
 *
 * 用于配置解析时过滤掉未知事件，避免把用户的笔误静默当成「没有配置」。
 */
export function isManagedHookEvent(value: string): value is HookEventName {
  return (
    value === "SessionStart" ||
    value === "UserPromptSubmit" ||
    value === "PreToolUse" ||
    value === "PermissionRequest" ||
    value === "PostToolUse" ||
    value === "PostToolUseFailure" ||
    value === "Stop"
  );
}
