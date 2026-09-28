// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  PermissionCapabilityGroup,
  type PermissionRuleset,
  type PermissionRuleValue,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";
import { webFetchRuleSubjects } from "./rule-matching.js";
import { compileRuleContent, evaluateRuleContent } from "./rule-content-program.js";
import { isWebFetchPreapprovedUrl } from "../tool/webfetch-preapproved.js";
import type { ToolPermissionRulePolicy } from "../tool/types.js";
import type {
  PermissionBehavior,
  PermissionContext,
  ResolvedPermissionCapability,
} from "./types.js";

const WEB_FETCH = "WebFetch";
const INPUT_FIELDS = ["command", "url", "file_path", "path", "pattern", "patch_text"] as const;
const RULE_ALIASES = new Map([["Write", "Edit"]]);
type RuleInput = { value: string; isWebFetch: boolean };

function selectInput(context: PermissionContext): RuleInput | undefined {
  const input = context.input;
  if (typeof input === "string") return { value: input, isWebFetch: false };
  if (input === null || typeof input !== "object") return undefined;
  const fields = input as Record<string, unknown>;
  if (context.toolName === WEB_FETCH) {
    const url = fields.url;
    if (typeof url === "string") return { value: url, isWebFetch: true };
  }
  for (const field of INPUT_FIELDS) {
    const value = fields[field];
    if (typeof value === "string") return { value, isWebFetch: false };
  }
  return undefined;
}

function inScope(
  rule: PermissionRuleValue,
  context: PermissionContext,
  capability: ResolvedPermissionCapability,
): boolean {
  const name = rule.toolName;
  // 保留名称不是身份凭据；全组许可必须来自宿主已验证的能力分组。
  if (name === OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME) {
    return capability.permissionCapabilityGroup === PermissionCapabilityGroup.OfficialCua;
  }
  const alias = RULE_ALIASES.get(context.toolName);
  // 缺失工具名与缺失别名都为 undefined，不能把两者相等当成有资格的规则。
  return name === context.toolName || (alias !== undefined && name === alias);
}

export function matchesProjectRules(
  ruleset: PermissionRuleset | null | undefined,
  behavior: PermissionBehavior,
  context: PermissionContext,
  capability: ResolvedPermissionCapability,
  rulePolicy?: ToolPermissionRulePolicy,
): boolean {
  const category = ruleset?.[behavior];
  if (!Array.isArray(category)) return false;
  const candidates = category.filter((rule) => inScope(rule, context, capability));
  if (!candidates.length) return false;
  if (rulePolicy) return rulePolicy.evaluateRules(behavior, candidates);

  for (const rule of candidates) {
    // 前条内容回调可能改变后条范围；选出的引用不等于永久获得匹配资格。
    if (!inScope(rule, context, capability)) continue;
    if (!rule.ruleContent) return true;
    const input = selectInput(context);
    if (!input) continue;
    const subjects = input.isWebFetch ? webFetchRuleSubjects(input.value) : [input.value];
    if (!subjects.length) continue;
    // 保持输入取值回调先于实际内容读取，不能使用回调执行前的旧内容。
    const program = compileRuleContent(rule.ruleContent!, input.isWebFetch);
    const targets = program.kind === "url" ? [input.value] : subjects;
    if (targets.some((subject) => evaluateRuleContent(program, subject))) return true;
  }
  return false;
}

export function isPreapprovedWebFetchRequest(context: PermissionContext): boolean {
  if (context.toolName !== WEB_FETCH) return false;
  const { input } = context;
  if (typeof input !== "object" || input === null) return false;
  const { url } = input as Record<string, unknown>;
  return typeof url === "string" && isWebFetchPreapprovedUrl(url);
}
