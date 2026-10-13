// embedded search 分支能力的判定实现：常量、类型与决策都在这里；公开文件只做转发。
const ENABLE_EMBEDDED_SEARCH_BRANCH = true;

const EMBEDDED_SEARCH_REASONS = {
  bashUnavailable: "bash_unavailable",
  disabledByGlobalFlag: "disabled_by_global_flag",
  supported: "supported",
} as const;

type EmbeddedSearchBranchCapabilityReason =
  (typeof EMBEDDED_SEARCH_REASONS)[keyof typeof EMBEDDED_SEARCH_REASONS];

export interface EmbeddedSearchBranchCapabilityContext {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
}
export interface EmbeddedSearchBranchCapabilityDecision {
  reason: EmbeddedSearchBranchCapabilityReason;
  useEmbeddedSearchBranch: boolean;
}

// 状态 → 原因查表：只有 supported 开启分支。
const REASON_BY_STATE = {
  disabled: EMBEDDED_SEARCH_REASONS.disabledByGlobalFlag,
  supported: EMBEDDED_SEARCH_REASONS.supported,
  unavailable: EMBEDDED_SEARCH_REASONS.bashUnavailable,
} as const;

type EmbeddedSearchBranchState = keyof typeof REASON_BY_STATE;

export function evaluateEmbeddedSearchBranchCapability(
  context: EmbeddedSearchBranchCapabilityContext,
): EmbeddedSearchBranchCapabilityDecision {
  const enabled = context.embeddedSearchBranchEnabled ?? ENABLE_EMBEDDED_SEARCH_BRANCH;
  const state: EmbeddedSearchBranchState = !enabled
    ? "disabled"
    : context.bashAvailable
      ? "supported"
      : "unavailable";
  const reason = REASON_BY_STATE[state];
  return { reason, useEmbeddedSearchBranch: reason === EMBEDDED_SEARCH_REASONS.supported };
}
