// SPDX-License-Identifier: Apache-2.0
// 子 Agent 的模型选择解析（B17）。
// 解析链优先级：内部 override > 显式 profile 意图（经 resolveSelection 解析）> 继承父选择。
// 显式 profile 是待解析意图；继承与内部 override 已有执行归属，不重新对应账号。
// 解析失败不回落父模型——否则会悄悄改变用户显式指定的子任务模型。
// 错误消息同时给英文/中文原因与 `[reason=<code>; selection=<provider>/<model>]` 标记：
// 公共错误投影不读结构化字段、后台只保留 message，两条消费路径都要能定位原因。
import { CoreErrorType, createCoreError } from "../../deps.js";
import type { ModelSelection } from "../../deps.js";
import { cloneModelSelection } from "../../model-selection.js";
import type { EffectiveModelSelectionResult } from "@knorvia/shared/model-selection";

// 选择请求面：字段名是兼容接口（调用方按名传参）。
export interface SubagentSelectionRequest {
  profileSelection?: /* 显式 profile：待解析的用户意图 */ ModelSelection | null;
  parentSelection?: /* 继承的父选择 */ ModelSelection | null;
  overrideSelection?: /* 内部 override：已有执行归属 */ ModelSelection;
  resolveSelection?: /* 解析器：把意图解析成生效选择 */ (
    selection: ModelSelection,
  ) => EffectiveModelSelectionResult;
}

// 解析结果：hasConcreteModel 只在显式 profile 意图存在时为 true；selection 是克隆。
export interface SubagentSelectionOutcome {
  hasConcreteModel: boolean;
  selection: ModelSelection;
}

// 错误文案（协议文案，逐字冻结）：双语原因 + `[reason=<code>; selection=<p>/<m>]` 标记。
const SELECTION_REASON_MESSAGES = {
  "selection-missing": "No model selected / 未选择模型", // selectionIssue=selection-missing
  "account-connection-unavailable": "Account connection unavailable / 当前账号连接不可用", // selectionIssue=account-connection-unavailable
  "provider-not-found": "Provider unavailable / 供应商不存在或不可用", // selectionIssue=provider-not-found
  "model-not-found": "Model unavailable / 模型不存在或不可用", // selectionIssue=model-not-found
  "reasoning-level-missing": "No reasoning level selected / 未选择思考档位", // selectionIssue=reasoning-level-missing
  "reasoning-level-not-supported": "Reasoning level unsupported / 不支持所选思考档位", // selectionIssue=reasoning-level-not-supported
} as const satisfies Record<NonNullable<EffectiveModelSelectionResult["selectionIssue"]>, string>;

// 解析链：override 优先，其次显式 profile（有 resolveSelection 就走解析器），否则继承父选择。
function resolveEffective(request: SubagentSelectionRequest): EffectiveModelSelectionResult {
  if (request.overrideSelection) {
    return { effectiveSelection: request.overrideSelection };
  }
  const explicit = request.profileSelection;
  if (!explicit) {
    return { effectiveSelection: request.parentSelection ?? null };
  }
  return request.resolveSelection
    ? request.resolveSelection(cloneModelSelection(explicit))
    : { effectiveSelection: explicit };
}

// 解析失败的配置错误（可恢复）：消息带双语原因与标记，context 带结构化原因。
function selectionFailure(
  request: SubagentSelectionRequest,
  outcome: EffectiveModelSelectionResult,
): Error {
  const reason = outcome.selectionIssue ?? "selection-missing";
  const askedFor = request.overrideSelection ?? request.profileSelection ?? request.parentSelection;
  const selectionTag = askedFor ? `; selection=${askedFor.providerId}/${askedFor.modelId}` : "";
  // 结构化字段与消息同时给原因：公共投影只读 message、后台只留 message，两路都能定位。
  const context: Record<string, unknown> = { selectionIssue: reason, reason };
  if (outcome.effectiveSelection) {
    context.providerId = outcome.effectiveSelection.providerId;
    context.modelId = outcome.effectiveSelection.modelId;
  }
  return createCoreError(
    CoreErrorType.ConfigurationError,
    `Cannot start subagent: ${SELECTION_REASON_MESSAGES[reason]} [reason=${reason}${selectionTag}]`,
    { recoverable: true, context },
  );
}

export const resolveSubagentSelection = (
  input: SubagentSelectionRequest,
): SubagentSelectionOutcome => {
  const outcome = resolveEffective(input);
  if (!outcome.effectiveSelection || outcome.selectionIssue) {
    throw selectionFailure(input, outcome);
  }
  const resolved: SubagentSelectionOutcome = {
    hasConcreteModel: input.profileSelection != null,
    selection: cloneModelSelection(outcome.effectiveSelection),
  };
  return resolved;
};
