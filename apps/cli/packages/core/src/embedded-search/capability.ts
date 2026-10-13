// 模型可见的 embedded search 分支默认开启：Bash 的 find/grep prelude 注入由执行层另行决定，shell 不支持 function 注入不应改变模型看到的 tool/prompt surface。
const ENABLE_EMBEDDED_SEARCH_BRANCH = true;

// 决策原因的三个取值（字符串是兼容面，逐字保留）。
const EMBEDDED_SEARCH_REASONS = {
  bashUnavailable: "bash_unavailable",
  disabledByGlobalFlag: "disabled_by_global_flag",
  supported: "supported",
} as const;

type EmbeddedSearchBranchCapabilityReason =
  (typeof EMBEDDED_SEARCH_REASONS)[keyof typeof EMBEDDED_SEARCH_REASONS];

interface EmbeddedSearchBranchCapabilityContext {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
}
interface EmbeddedSearchBranchCapabilityDecision {
  reason: EmbeddedSearchBranchCapabilityReason;
  useEmbeddedSearchBranch: boolean;
}

// 只有 supported 开启分支；其余原因一律关闭（每次返回新对象）。
const decideEmbeddedSearchBranch = (
  reason: EmbeddedSearchBranchCapabilityReason,
): EmbeddedSearchBranchCapabilityDecision => ({
  reason,
  useEmbeddedSearchBranch: reason === EMBEDDED_SEARCH_REASONS.supported,
});

// 关闭条件按优先级判断：全局开关优先于 shell 能力。
function evaluateEmbeddedSearchBranchCapability(
  context: EmbeddedSearchBranchCapabilityContext,
): EmbeddedSearchBranchCapabilityDecision {
  const branchEnabled = context.embeddedSearchBranchEnabled ?? ENABLE_EMBEDDED_SEARCH_BRANCH;
  switch (true) {
    case !branchEnabled:
      return decideEmbeddedSearchBranch(EMBEDDED_SEARCH_REASONS.disabledByGlobalFlag);
    case !context.bashAvailable:
      return decideEmbeddedSearchBranch(EMBEDDED_SEARCH_REASONS.bashUnavailable);
    default:
      return decideEmbeddedSearchBranch(EMBEDDED_SEARCH_REASONS.supported);
  }
}

export const resolveEmbeddedSearchBranchCapability = (input: {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
}): EmbeddedSearchBranchCapabilityDecision => evaluateEmbeddedSearchBranchCapability({ ...input });
