// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  AMEND_WORKFLOW_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  type PermissionRuleset,
} from "@knorvia/contracts";
import type { ToolPermissionRulePolicy } from "../tool/types.js";
import { isPreapprovedWebFetchRequest, matchesProjectRules } from "./project-rule-matching.js";
import { isPreapprovedWorkflowDraftWrite } from "./workflow-draft-path.js";
import type {
  PermissionBehavior,
  PermissionConfig,
  PermissionContext,
  ResolvedPermissionCapability,
} from "./types.js";

export interface PolicyFacts {
  readonly context: PermissionContext;
  readonly capability: ResolvedPermissionCapability;
  readonly config: PermissionConfig;
  readonly readSessionRules: () => PermissionRuleset;
  readonly projectRules?: PermissionRuleset | null;
  readonly rulePolicy?: ToolPermissionRulePolicy;
}

export interface PolicyRule {
  readonly ruleId: string;
  readonly decision: PermissionBehavior;
  readonly reason: string | ((facts: PolicyFacts) => string);
  readonly matches: (facts: PolicyFacts) => boolean;
}

const unconditional = () => true;
const rule = (
  ruleId: string,
  decision: PermissionBehavior,
  reason: PolicyRule["reason"],
  matches: PolicyRule["matches"] = unconditional,
): PolicyRule => Object.freeze({ ruleId, decision, reason, matches });
const toolReason =
  (suffix: string) =>
  ({ context }: PolicyFacts) =>
    `Tool ${context.toolName} ${suffix}`;
const planActive = ({ context }: PolicyFacts) => context.planEnabled ?? context.mode === "plan";
const projectMatch = (behavior: PermissionBehavior) => (facts: PolicyFacts) =>
  matchesProjectRules(
    facts.projectRules,
    behavior,
    facts.context,
    facts.capability,
    facts.rulePolicy,
  );

function ownsAmendedRun({ context }: PolicyFacts): boolean {
  if (
    context.toolName !== AMEND_WORKFLOW_TOOL_NAME ||
    !context.input ||
    typeof context.input !== "object"
  )
    return false;
  const facts = (context.input as Record<string, unknown>).predecessor;
  return (
    !!facts &&
    typeof facts === "object" &&
    (facts as Record<string, unknown>).owned_by_this_session === true &&
    (facts as Record<string, unknown>).stop_reason !== "user"
  );
}

const control = [
  rule(
    "tool.plan.enter",
    "allow",
    "EnterPlanMode switches to plan mode without a permission prompt",
    (f) => f.context.toolName === ENTER_PLAN_MODE_TOOL_NAME,
  ),
  rule(
    "mode.plan.exitOnly",
    "deny",
    "ExitPlanMode can only be used while plan mode is active",
    (f) => f.context.toolName === EXIT_PLAN_MODE_TOOL_NAME && !planActive(f),
  ),
] as const;
const disallowed = rule(
  "rule.disallowedTools",
  "deny",
  toolReason("is explicitly disallowed"),
  (f) => f.config.disallowedTools.has(f.context.toolName),
);
const automatic = rule(
  "mode.auto.unimplemented",
  "deny",
  "Auto mode is reserved but not implemented yet",
  (f) => f.context.mode === "auto",
);
const projectDeny = rule(
  "rule.project.deny",
  "deny",
  toolReason("is denied by project permission rules"),
  projectMatch("deny"),
);
const projectAsk = rule(
  "rule.project.ask",
  "ask",
  toolReason("requires approval by project permission rules"),
  projectMatch("ask"),
);

const interaction = [
  disallowed,
  rule("tool.userInteraction", "ask", toolReason("requires user interaction")),
] as const;

const mandatory = [
  automatic,
  disallowed,
  projectDeny,
  // 仅本次批准不能复用旧 grant；能力选项是边界，不凭同名规则推断用户授权。
  rule(
    "rule.session.allow",
    "allow",
    toolReason("was allowed for this session"),
    (f) =>
      f.capability.allowSessionApproval &&
      // 项目规则回调可同步授予会话规则；抵达本阶段才读取同一 owner 的当前值。
      matchesProjectRules(f.readSessionRules(), "allow", f.context, f.capability, f.rulePolicy),
  ),
  rule(
    "rule.session.workflowOwner",
    "allow",
    toolReason("amends a run this session started"),
    ownsAmendedRun,
  ),
  rule("tool.alwaysAsk", "ask", toolReason("always requires explicit approval")),
] as const;

const ordinary = [
  // 普通 yolo 的已有优先级只在这条路线生效，不能绕过 interaction/mandatory。
  rule(
    "mode.yolo",
    "allow",
    "Yolo mode bypasses permission prompts",
    (f) => f.context.mode === "yolo" && !planActive(f),
  ),
  automatic,
  disallowed,
  projectDeny,
  projectAsk,
] as const;

const plan = [
  rule(
    "mode.plan.readOnly",
    "allow",
    "Plan mode allows read-only tool execution",
    (f) => f.capability.readOnly && !f.capability.destructive,
  ),
  rule(
    "mode.plan.mcp",
    "allow",
    "Plan mode allows non-destructive MCP tool execution",
    (f) => f.capability.permissionName === "mcp" && !f.capability.destructive,
  ),
  rule(
    "mode.plan.explicitSessionCapability",
    "allow",
    "Plan mode allows this explicit non-destructive session control action",
    (f) =>
      f.capability.allowedInPlanMode &&
      f.capability.sideEffectScope === "session" &&
      !f.capability.destructive &&
      !f.capability.needsApproval,
  ),
  rule("mode.plan.nonReadOnly", "deny", "Plan mode only allows read-only, non-destructive tools"),
] as const;

const exemptions = [
  rule(
    "rule.project.allow",
    "allow",
    toolReason("is allowed by project permission rules"),
    projectMatch("allow"),
  ),
  rule("tool.webfetch.preapproved", "allow", "WebFetch URL is preapproved", (f) =>
    isPreapprovedWebFetchRequest(f.context),
  ),
  rule("tool.workflowDraft.preapproved", "allow", "Workflow draft file is preapproved", (f) =>
    isPreapprovedWorkflowDraftWrite(f.context),
  ),
  rule("rule.allowedTools", "allow", toolReason("is explicitly allowed"), (f) =>
    f.config.allowedTools.has(f.context.toolName),
  ),
  rule(
    "mode.edit.fileEdit",
    "allow",
    "Edit mode allows file edit tools",
    (f) =>
      f.context.mode === "edit" &&
      f.capability.permissionName === "edit" &&
      f.capability.sideEffectScope === "workspace",
  ),
] as const;

const build = [
  rule(
    "mode.build.readOnly",
    "allow",
    "Build mode allows read-only tools",
    (f) => f.capability.readOnly && !f.capability.destructive && !f.capability.needsApproval,
  ),
  rule(
    "mode.build.criticalRisk",
    "ask",
    "Critical risk tools require explicit approval",
    (f) => f.capability.riskLevel === "critical",
  ),
  rule(
    "mode.build.highRisk",
    "ask",
    "High risk tools require explicit approval",
    (f) => f.capability.riskLevel === "high" && !f.config.autoApproveHighRisk,
  ),
  rule(
    "mode.build.sessionState",
    "allow",
    "Build mode allows low-risk session-local state updates",
    (f) =>
      f.capability.sideEffectScope === "session" &&
      f.capability.riskLevel === "low" &&
      !f.capability.destructive &&
      !f.capability.needsApproval,
  ),
  rule(
    "mode.build.sideEffect",
    "ask",
    "Tool has side effects and requires approval",
    (f) =>
      f.capability.needsApproval ||
      f.capability.destructive ||
      f.capability.sideEffectScope !== "none",
  ),
  rule("mode.build.lowRisk", "allow", "Build mode allows low-risk tool execution"),
] as const;

/** A lazy itinerary: only the selected route can read project/session rules or inputs. */
export function* permissionPolicyProgram(facts: PolicyFacts): Generator<PolicyRule> {
  yield* control;
  if (facts.capability.requiresUserInteraction) {
    yield* interaction;
    return;
  }
  if (facts.capability.alwaysAsk) {
    yield* mandatory;
    return;
  }
  // 规则端口可能修改调用者 context；本次计划模式事实必须在调用它之前捕获。
  const activePlan = planActive(facts);
  yield* ordinary;
  if (activePlan) {
    yield* plan;
    return;
  }
  yield* exemptions;
  yield* build;
}
