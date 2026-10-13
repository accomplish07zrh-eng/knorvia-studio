import {
  evaluateEmbeddedSearchBranchCapability,
  type EmbeddedSearchBranchCapabilityDecision,
} from "./capability-internal.js";

/** 模型可见的 embedded search 分支能力：判定实现见 capability-internal，公开面只保留本函数。 */
export const resolveEmbeddedSearchBranchCapability = (input: {
  bashAvailable: boolean;
  embeddedSearchBranchEnabled?: boolean;
}): EmbeddedSearchBranchCapabilityDecision => evaluateEmbeddedSearchBranchCapability(input);
