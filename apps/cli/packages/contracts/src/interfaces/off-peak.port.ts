// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 闲时任务端口 —— 把活排到非高峰时段去跑
// ════════════════════════════════════════════════════════════
// 与 AutomationPort 并排的两条路：定时任务按时间表醒来，闲时任务则由服务端在价格与额度合适的窗口里
// 挑时间执行。create 不抛错，而是交回一个判别联合——失败究竟是「没资格（3101）」「额度用尽（3103）」
// 还是网络问题，必须原样穿过 CLI↔host 协议送到 handler，模型才能拿到稳定、可行动的错误提示；把失败
// 压成一句 message、让上层去嗅文本，这个分类就丢了。

// 所有权：失败分类与判定谓词属于本端口，任务的创建、排队与持久化归实现方。

// 章节：一 结果语汇 · 二 失败分类的判定 · 三 创建上下文与端口本体

import type { OffPeakCreateInput, OffPeakTaskSummary } from "../tools/off-peak.js";

// ── 一、结果语汇：创建成功或失败分别长什么样 ─────────────────────────

/** 失败发生在哪一段：本地校验、向服务端换票，还是把结果落到本地。 */
export type OffPeakCreateFailureStage = "client_validation" | "ticket_request" | "local_persist";

/** 失败的原因分类；3101/3103 两个数值码是服务端定的，跨边界时不能退化。 */
export type OffPeakCreateErrorCategory =
  | "client_validation"
  | "eligibility_3101"
  | "quota_3103"
  | "network"
  | "invalid_response"
  | "local_persist"
  | "unknown";

/** 创建闲时任务的判别联合。成功一侧给出任务摘要；失败一侧三件事都要报：卡在哪一段、属于哪一类， 以及服务端或本地给出的原始错误码字符串，便于上层原样转述给模型。 */
export type OffPeakCreateOutcome =
  | { ok: true; task: OffPeakTaskSummary }
  | {
      ok: false;
      failureStage: OffPeakCreateFailureStage;
      errorCategory: OffPeakCreateErrorCategory;
      errorCode: string;
    };

// ── 二、失败分类的判定：窄化辅助 ─────────────────────────────────────

/** 取出失败结果的分类；成功结果没有分类，交回 undefined。 */
function failureCategoryOf(outcome: OffPeakCreateOutcome): OffPeakCreateErrorCategory | undefined {
  return outcome.ok ? undefined : outcome.errorCategory;
}

/** 是否因为不满足闲时资格（3101）而失败。 */
export function isOffPeakEligibilityFailure(
  outcome: OffPeakCreateOutcome,
): outcome is Extract<OffPeakCreateOutcome, { ok: false }> {
  return failureCategoryOf(outcome) === "eligibility_3101";
}

/** 是否因为闲时额度用尽（3103）而失败。 */
export function isOffPeakQuotaFailure(
  outcome: OffPeakCreateOutcome,
): outcome is Extract<OffPeakCreateOutcome, { ok: false }> {
  return failureCategoryOf(outcome) === "quota_3103";
}

// ── 三、创建上下文与端口本体 ─────────────────────────────────────────

/** 创建时由执行器补上的运行时事实，模型自己填不了。sessionId 是这次任务的绑定会话：首次执行会 resume 它，与 CronCreate 的 targetTaskId 是同一个思路。 */
export interface OffPeakCreateContext {
  sessionId?: string;
}

/** 闲时任务端口的能力面：创建一个任务，或者列出已有的任务摘要。 */
export interface OffPeakPort {
  create(input: OffPeakCreateInput, context?: OffPeakCreateContext): Promise<OffPeakCreateOutcome>;
  list(): Promise<OffPeakTaskSummary[]>;
}
