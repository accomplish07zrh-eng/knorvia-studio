// SPDX-License-Identifier: Apache-2.0
// 回滚目标的判定实现。行为规格见 contracts-02 behavior.md 的 B7；公开签名冻结在 interface.md。
//
// 组织方式（替换阶段的自主决定）：把旧实现的嵌套 if 改成「先解析边界事实 → 再用有序规则表
// 逐条匹配」的形状。规则表让每条分支的理由（reason）与结果（strategy/targetStatus）在同一处
// 声明，新增分支只加一行规则，不必再往 if 链里插条件。
import { isCompactBoundaryItem, parseCompactBoundaryPayload } from "../compact/index.js";
import type { CompactContextItem } from "../compact/index.js";
import {
  RewindScope,
  RewindStrategy,
  RewindTargetStatus,
  type EvaluateRewindTargetInput,
  type RewindTargetEvaluation,
} from "./payload-schemas.js";

// 判定上下文：一次评估里固定不变的三个事实。
interface EvaluationFacts {
  checkpointAvailable: boolean;
  coveredByCompact: boolean;
  requestedScope: RewindScope;
}

// 边界事实：compact 边界 payload 及其标识，两条路径都要带上。
interface BoundaryFacts {
  boundary?: RewindTargetEvaluation["compactBoundary"];
  boundaryId?: string;
}

function activeChainScopes(checkpointAvailable: boolean): RewindScope[] {
  if (!checkpointAvailable) return [RewindScope.Conversation];
  return [RewindScope.Conversation, RewindScope.Workspace, RewindScope.Both];
}

function isScopeAllowed(scope: RewindScope, allowed: readonly RewindScope[]): boolean {
  return allowed.includes(scope);
}

function evaluation(
  facts: EvaluationFacts,
  boundary: BoundaryFacts,
  allowedScopes: RewindScope[],
  reason: string,
  strategy: RewindStrategy,
  targetStatus: RewindTargetStatus,
): RewindTargetEvaluation {
  return {
    allowedScopes,
    compactBoundary: boundary.boundary,
    compactBoundaryId: boundary.boundaryId,
    reason,
    strategy,
    targetStatus,
  };
}

// 有序规则表：第一条 when 为真的规则决定结果。
const RULES: ReadonlyArray<{
  when: (facts: EvaluationFacts) => boolean;
  resolve: (facts: EvaluationFacts, boundary: BoundaryFacts) => RewindTargetEvaluation;
}> = [
  {
    // 目标落在 compact 边界之前、且请求的是工作区回滚、又拿得到 checkpoint：只恢复文件。
    when: (facts) =>
      facts.coveredByCompact &&
      facts.requestedScope === RewindScope.Workspace &&
      facts.checkpointAvailable,
    resolve: (facts, boundary) =>
      evaluation(
        facts,
        boundary,
        [RewindScope.Workspace],
        "target_covered_by_compact_file_only_available",
        RewindStrategy.FileOnly,
        RewindTargetStatus.CoveredByCompact,
      ),
  },
  {
    // 同样被 compact 覆盖，但请求工作区回滚却没有 checkpoint：无法执行。
    when: (facts) => facts.coveredByCompact && facts.requestedScope === RewindScope.Workspace,
    resolve: (facts, boundary) =>
      evaluation(
        facts,
        boundary,
        [],
        "target_covered_by_compact_without_checkpoint",
        RewindStrategy.Unavailable,
        RewindTargetStatus.CoveredByCompact,
      ),
  },
  {
    // 其余「被 compact 覆盖」的情况：conversation 可以 branch cut 后重建 compact scope。
    when: (facts) => facts.coveredByCompact,
    resolve: (facts, boundary) => {
      const allowed = activeChainScopes(facts.checkpointAvailable);
      if (!isScopeAllowed(facts.requestedScope, allowed)) {
        return evaluation(
          facts,
          boundary,
          allowed,
          "checkpoint_required_for_workspace_rewind",
          RewindStrategy.Unavailable,
          RewindTargetStatus.CoveredByCompact,
        );
      }
      return evaluation(
        facts,
        boundary,
        allowed,
        "target_covered_by_compact_active_branch_rebuild",
        RewindStrategy.ActiveChain,
        RewindTargetStatus.CoveredByCompact,
      );
    },
  },
  {
    // 目标仍在活跃链上：按 checkpoint 可用性给出允许范围。
    when: () => true,
    resolve: (facts, boundary) => {
      const allowed = activeChainScopes(facts.checkpointAvailable);
      if (!isScopeAllowed(facts.requestedScope, allowed)) {
        return evaluation(
          facts,
          boundary,
          allowed,
          "checkpoint_required_for_workspace_rewind",
          RewindStrategy.Unavailable,
          RewindTargetStatus.ActiveChain,
        );
      }
      return evaluation(
        facts,
        boundary,
        allowed,
        "target_in_active_chain",
        RewindStrategy.ActiveChain,
        RewindTargetStatus.ActiveChain,
      );
    },
  },
];

function resolveBoundary<T extends { id: string }>(
  input: EvaluateRewindTargetInput<T>,
): { boundaryIndex: number; boundary: BoundaryFacts } {
  const isBoundary =
    input.isBoundary ?? ((item: T) => isCompactBoundaryItem(item as CompactContextItem));
  const boundaryIndex = input.items.findLastIndex(isBoundary);
  if (boundaryIndex < 0) return { boundaryIndex, boundary: {} };
  const item = input.items[boundaryIndex] as CompactContextItem;
  const payload = parseCompactBoundaryPayload(item.compactBoundary);
  return {
    boundaryIndex,
    boundary: { boundary: payload, boundaryId: payload?.boundaryId },
  };
}

export function evaluateRewindTarget<T extends { id: string }>(
  input: EvaluateRewindTargetInput<T>,
): RewindTargetEvaluation {
  const getId = input.getId ?? ((item: T) => item.id);
  const targetIndex = input.items.findIndex((item) => getId(item) === input.targetMessageId);
  const { boundaryIndex, boundary } = resolveBoundary(input);

  if (targetIndex < 0) {
    return evaluation(
      { checkpointAvailable: false, coveredByCompact: false, requestedScope: input.scope },
      boundary,
      [],
      "target_not_found",
      RewindStrategy.Unavailable,
      RewindTargetStatus.Missing,
    );
  }

  const facts: EvaluationFacts = {
    checkpointAvailable: input.checkpointAvailable === true,
    coveredByCompact: boundaryIndex >= 0 && targetIndex < boundaryIndex,
    requestedScope: input.scope,
  };

  const rule = RULES.find((candidate) => candidate.when(facts));
  if (rule === undefined) throw new Error("rewind evaluation rules must cover every case");
  return rule.resolve(facts, boundary);
}
