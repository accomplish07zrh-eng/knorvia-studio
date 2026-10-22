// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// SessionStart 挂载点：接到 DSH 的 `session/created`（emit 模式）。
//
// DSH 侧事实（specs/contracts/kernel-plugin-hooks/behavior.md §2.2）：
//   `session/created` 是 `@mode emit`；**同步 throw 能否决并回滚**；
//   **返回 rejected promise 只记录，不能追溯否决**。
//
// ⚠️ 探针 26-30 实测（决定本模块的实现形态）：
//   · 同步 throw → 传播给调用方 → 可否决 ✅
//   · **async 监听器的 throw 变成 rejection → 不能否决** ❌
//   · emit 不 await async 监听器（同步返回）
//   · 同步 throw 会中断后续监听器（短路）
//
// → 而 Hook 脚本（process / command 形态）**本质是异步的**：
//   必须起子进程、等输出、解析 JSON —— 这些都无法在同步函数里完成。
//
// → **所以「Hook 能否决会话创建」在 DSH 上是结构性不可行的**（known-differences D2）。
//   本模块因此**不做否决**，只做两件事：
//     ① 同步可判定的部分（如「本地配置里明确禁用」）→ 同步 throw 否决
//     ② 需要异步 Hook 的部分 → 记录并在第一次提交前用 UserPromptSubmit 兜住
import type { Context } from "@deepseek-ai/cordis";

/** DSH 的 Session（只取本模块用到的字段）。 */
export interface SessionLike {
  readonly id: string;
}

/** 一次会话创建判定：**必须是同步函数**才能否决（探针 27）。 */
export type SessionStartJudge = (session: SessionLike) => SessionStartVerdict;

/**
 * 会话创建的裁决。
 *
 * ⚠️ 只有 `veto` 会产生效果（同步 throw）；其余分支都是「记录后放行」。
 * 之所以不提供「异步 veto」，是因为 DSH 的 emit 模式不支持（探针 27 实测）。
 */
export type SessionStartVerdict =
  /** 同步否决：抛错让 DSH 回滚会话创建。 */
  | { readonly kind: "veto"; readonly reason: string }
  /** 放行（可带一条观测记录，供 telemetry 使用）。 */
  | { readonly kind: "allow"; readonly note?: string };

/**
 * 处理一次会话创建。
 *
 * **本函数必须是同步的** —— 只有同步 throw 能否决（探针 26/27）。
 * 若写成 async，throw 会变成 rejection，DSH 只记录而不回滚。
 */
export function handleSessionCreated(judge: SessionStartJudge, session: SessionLike): void {
  const verdict = judge(session);
  if (verdict.kind === "veto") {
    // 同步 throw 是唯一能被 DSH 识别的否决方式（§2.2）。
    throw new Error(verdict.reason);
  }
  // allow → 什么都不做（note 由调用方的 telemetry 自行取用）
}

/**
 * 注册 SessionStart 挂载点。
 *
 * ⚠️ 监听器是**非 async 的同步函数** —— 这是能否决的前提。
 * 若未来需要异步判定，只能做「记录 + 在 UserPromptSubmit 兜住」，
 * 不能在这里 await（会把否决能力变成 no-op）。
 */
export function mountSessionStart(ctx: Context, judge: SessionStartJudge): () => void {
  const handler = (session: SessionLike) => handleSessionCreated(judge, session);
  return ctx.on("session/created", handler);
}

/**
 * 把异步 Hook 的判定结果转成「延迟兜底」的裁决。
 *
 * 因为异步 Hook 不能否决会话创建（探针 27），本包提供这条路径：
 * 异步判定为「应阻断」时，在 `UserPromptSubmit`（`agent/pre-step`）阶段拒绝第一次提交。
 *
 * **这是 known-differences D2 的实现层应对**：不是等价替代，而是「最接近的可行方案」。
 */
export function deferredVetoReason(asyncVerdict: {
  readonly shouldBlock: boolean;
  readonly reason?: string;
}): { readonly kind: "deny"; readonly reason: string } | undefined {
  if (!asyncVerdict.shouldBlock) return undefined;
  return {
    kind: "deny",
    reason: asyncVerdict.reason ?? "session start hook requested blocking",
  };
}
