// SPDX-License-Identifier: Apache-2.0
// bash 权限规则策略：先把一次 Bash 调用折算成「授权计划」（精确形态、主体组、
// 需审批段），再由计划装配规则匹配闭包与建议授权。稳定动作前缀的折叠
// （包装词剥离、注册表下钻）在 action-folding；本模块只做计划与装配。
import type { PermissionRuleValue, PermissionUpdate } from "@knorvia/contracts";
import type {
  ToolPermissionRulePolicy,
  ToolRuntimePermissionCapabilityContext,
} from "../../types.js";
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
  type BashCommandAnalysis,
  type BashCommandInvocation,
} from "../bash-command-parser.js";
import { evaluateBashRules } from "../bash-command-rule-evaluator.js";
import { isRuntimeReadOnlyBashCommand } from "../bash-semantics.js";
import { foldActionHead, literalBindingTokens } from "./action-folding.js";

const SUGGESTED_RULE_LIMIT = 5;

interface AuthorizationPlan {
  /** 原样与去空白两种命令形态，供精确规则匹配。 */
  exactForms: string[];
  trimmed: string;
  /** 分析是否静态可映射（可解析、无重定向、赋值皆字面量）。 */
  mappable: boolean;
  /** 全部命令段的规则主体组（安全时）。 */
  everyGroup: string[][];
  /** 需要审批的命令段（只读判定为否的段）。 */
  mutating: BashCommandInvocation[];
  /** 需审批段的规则主体组。 */
  requiredGroup: string[][];
}

export function resolveBashPermissionRulePolicy(
  payload: unknown,
  runtime?: ToolRuntimePermissionCapabilityContext,
): ToolPermissionRulePolicy | undefined {
  const command = extractCommand(payload);
  if (command === undefined) return undefined;
  return policyFromPlan(derivePlan(command, runtime));
}

function derivePlan(
  command: string,
  runtime: ToolRuntimePermissionCapabilityContext | undefined,
): AuthorizationPlan {
  const trimmed = command.trim();
  const parsed = analyzeBashCommand(command);
  const mappable = analysisIsRuleMappable(parsed);
  const segments = mappable ? parsed.commands : [];
  const mutating = segments.filter(
    (invocation) => !isRuntimeReadOnlyBashCommand(invocation.commandText, runtime),
  );
  return {
    exactForms: command === trimmed ? [trimmed] : [command, trimmed],
    trimmed,
    mappable,
    everyGroup: segments.map(subjectsForInvocation),
    mutating,
    requiredGroup: mutating.map(subjectsForInvocation),
  };
}

function policyFromPlan(plan: AuthorizationPlan): ToolPermissionRulePolicy {
  return {
    evaluateRules(behavior, rules) {
      return evaluateBashRules({
        allSubjectGroups: plan.everyGroup,
        behavior,
        exactCommands: plan.exactForms,
        requiredSubjectGroups: plan.requiredGroup,
        rules,
        safe: plan.mappable,
      });
    },
    suggestedPermissionUpdates: proposeAllowRules(plan),
  };
}

// 静态视图可用的前提：语法可解析、无重定向、每段的环境赋值都是静态字面量。
function analysisIsRuleMappable(parsed: BashCommandAnalysis): boolean {
  if (!isBashCommandPermissionSafe(parsed)) return false;
  if (parsed.hasRedirects) return false;
  if (parsed.commands.length === 0) return false;
  return parsed.commands.every(
    (invocation) =>
      !invocation.hasRedirects &&
      !invocation.hasDynamicWords &&
      literalBindingTokens(invocation) !== undefined,
  );
}

function subjectsForInvocation(invocation: BashCommandInvocation): string[] {
  const literal = literalInvocationText(invocation);
  const folded = foldActionHead(invocation);
  // 规则保存会把 --dir/-C 一类全局旗标剥掉；同时保留原始形态兼容历史通配规则。
  return folded && folded !== literal ? [literal, folded] : [literal];
}

function literalInvocationText(invocation: BashCommandInvocation): string {
  return [...(literalBindingTokens(invocation) ?? []), ...invocation.argv].join(" ");
}

// 建议授权：安全且每个需审批段都能折叠出稳定前缀时给「前缀:*」规则族，
// 否则回退成整条命令的精确授权。
function proposeAllowRules(plan: AuthorizationPlan): PermissionUpdate[] {
  if (plan.trimmed.length === 0) return [];
  const foldedSegments = plan.mappable ? plan.mutating.map(foldActionHead) : [];
  const unusable =
    !plan.mappable ||
    plan.mutating.length === 0 ||
    plan.mutating.length > SUGGESTED_RULE_LIMIT ||
    foldedSegments.some((folded) => folded === undefined);
  if (unusable) return wholeCommandLineAllow(plan.trimmed);

  const collected: PermissionRuleValue[] = [];
  const uniqueContents = new Set<string>();
  for (const folded of foldedSegments) {
    const content = `${folded}:*`;
    if (uniqueContents.has(content)) continue;
    uniqueContents.add(content);
    collected.push({ ruleContent: content, toolName: "Bash" });
  }
  if (collected.length === 0 || collected.length > SUGGESTED_RULE_LIMIT) {
    return wholeCommandLineAllow(plan.trimmed);
  }
  return [{ behavior: "allow", rules: collected, type: "addRules" }];
}

function wholeCommandLineAllow(commandLine: string): PermissionUpdate[] {
  const only: PermissionRuleValue = { ruleContent: commandLine, toolName: "Bash" };
  return [{ behavior: "allow", rules: [only], type: "addRules" }];
}

function extractCommand(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const field = (payload as Record<string, unknown>).command;
  return typeof field === "string" ? field : undefined;
}
