// SPDX-License-Identifier: Apache-2.0
// embedded search 分支能力的判定实现。
// 公开文件 capability.ts 只保留导出转发，常量、类型与决策逻辑都集中在这里。
//
// 判定规则（与契约一致）：
//   1. 显式关闭优先：embeddedSearchBranchEnabled 为 false 时直接关闭分支；
//   2. 否则要求 shell 可用：bashAvailable 为 false 时关闭分支；
//   3. 两者都满足才开启分支。
// 三个 reason 字符串是兼容面，逐字保留。

const ENABLE_EMBEDDED_SEARCH_BRANCH = true;

const EMBEDDED_SEARCH_REASONS = {
  bashUnavailable: "bash_unavailable",
  disabledByGlobalFlag: "disabled_by_global_flag",
  supported: "supported",
} as const;

const REASON_BY_STATE = {
  disabled: EMBEDDED_SEARCH_REASONS.disabledByGlobalFlag,
  supported: EMBEDDED_SEARCH_REASONS.supported,
  unavailable: EMBEDDED_SEARCH_REASONS.bashUnavailable,
} as const;

type EmbeddedSearchBranchCapabilityReason =
  (typeof EMBEDDED_SEARCH_REASONS)[keyof typeof EMBEDDED_SEARCH_REASONS];
type EmbeddedSearchBranchState = keyof typeof REASON_BY_STATE;

export interface EmbeddedSearchBranchCapabilityContext {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
}
export interface EmbeddedSearchBranchCapabilityDecision {
  reason: EmbeddedSearchBranchCapabilityReason;
  useEmbeddedSearchBranch: boolean;
}

/** 由上下文推导状态：关闭开关优先，其次看 shell 能力。 */
const stateOf = (context: EmbeddedSearchBranchCapabilityContext): EmbeddedSearchBranchState => {
  const enabled = context.embeddedSearchBranchEnabled ?? ENABLE_EMBEDDED_SEARCH_BRANCH;
  if (!enabled) return "disabled";
  return context.bashAvailable ? "supported" : "unavailable";
};

/** 解析能力：状态查表得到原因，只有 supported 开启分支（每次返回新对象）。 */
export const evaluateEmbeddedSearchBranchCapability = (
  context: EmbeddedSearchBranchCapabilityContext,
): EmbeddedSearchBranchCapabilityDecision => {
  const reason = REASON_BY_STATE[stateOf(context)];
  return { reason, useEmbeddedSearchBranch: reason === EMBEDDED_SEARCH_REASONS.supported };
};
