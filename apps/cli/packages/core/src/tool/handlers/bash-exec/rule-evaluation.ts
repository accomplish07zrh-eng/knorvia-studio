// SPDX-License-Identifier: Apache-2.0
// bash 权限规则求值：规则文本与一次命令调用的主体集合做匹配。
// 顺序语义（合同冻结）：存在空白规则 → 直接放行；精确命令命中 → 放行；
// 非安全分析 → 拒绝；之后 allow 需要每个主体组都有命中，deny 只要一组命中即否。
import type { PermissionRuleValue } from "@knorvia/contracts";
import { wildcardToRegExp } from "../../../permission/rule-matching.js";
import type { BashRuleEvaluationInput } from "../bash-command-rule-evaluator.js";

export function evaluateBashRules(input: BashRuleEvaluationInput): boolean {
  if (rulesContainBlank(input.rules)) return true;
  if (listedRuleCoversExact(input.exactCommands, input.rules)) return true;
  if (!input.safe) return false;
  const groups = input.behavior === "allow" ? input.requiredSubjectGroups : input.allSubjectGroups;
  if (groups.length === 0) return false;
  return input.behavior === "allow"
    ? groupsEveryHit(groups, input.rules)
    : groupsSomeHit(groups, input.rules);
}

function rulesContainBlank(rules: readonly PermissionRuleValue[]): boolean {
  return rules.some((rule) => !rule.ruleContent);
}

function listedRuleCoversExact(
  exactCommands: readonly string[],
  rules: readonly PermissionRuleValue[],
): boolean {
  const hasCandidates = exactCommands.some((command) => command.length > 0);
  if (!hasCandidates) return false;
  return rules.some((rule) => exactCommands.includes(rule.ruleContent ?? ""));
}

// allow：每个主体组都要至少一个主体命中一条规则。
function groupsEveryHit(
  groups: readonly (readonly string[])[],
  rules: readonly PermissionRuleValue[],
): boolean {
  return groups.every((subjects) => subjectsSomeHit(subjects, rules));
}

// deny：任意一个主体命中一条规则即成立。
function groupsSomeHit(
  groups: readonly (readonly string[])[],
  rules: readonly PermissionRuleValue[],
): boolean {
  return groups.some((subjects) => subjectsSomeHit(subjects, rules));
}

function subjectsSomeHit(
  subjects: readonly string[],
  rules: readonly PermissionRuleValue[],
): boolean {
  return subjects.some((subject) =>
    rules.some((rule) => ruleCoversSubject(rule.ruleContent, subject)),
  );
}

// 匹配三态：空白规则内容视为全匹配；"前缀:*" 只匹配整词前缀（命令或 tab 分隔的子命令）；
// 含通配符的规则转正则；其余按全等比较。
function ruleCoversSubject(ruleContent: string | undefined, subject: string): boolean {
  if (!ruleContent) return true;
  if (ruleContent.endsWith(":*")) {
    const head = ruleContent.slice(0, -2);
    return subject === head || subject.startsWith(`${head} `) || subject.startsWith(`${head}\t`);
  }
  if (ruleContent.includes("*")) return wildcardToRegExp(ruleContent).test(subject);
  return subject === ruleContent;
}
