// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：7 条路线的判定。
//
// 契约依据：specs/contracts/kernel-plugin-policy/behavior.md B5/B6/B7/B9、
//           README §三 L1（路线顺序）、known-differences.md K2/K3。
// 权威行为依据：specs/knorvia-permission-policy.md「必须保留的优先级」1–7 条。
//
// **路线顺序即安全语义，不可调整**：
//   control → interaction → mandatory → ordinary → plan → exemptions → build
//
// 本文件按 Lead 2026-10-22 裁决拆成两组：
//
//   ① 硬约束（`evaluateHardRoutes`）—— 产品级，**不可被下游 Hook 绕过**
//      control / interaction / mandatory / 会话授权
//   ② 软约束（`evaluateSoftRoutes`）—— 产品策略，Hook 可参与
//      ordinary / plan / exemptions / build
//
// 为什么这样拆：waterfall 里「不调 next() 即短路」。若本包对所有调用都短路，
// 下游 `kernel-plugin-hooks` 的 PreToolUse 永远不触发 —— 与「policy 先判 → hooks 后判」冲突。
// 所以硬约束短路、软约束在下游放行后再叠加（见 index.ts 的装配序列）。

import type { CollaborationMode } from "./mode-registry.js";
import type { ResolvedCapability, SideEffectScope } from "./capability-resolver.js";
import { compileRuleContent, evaluateRuleContent, webFetchRuleSubjects } from "./rule-content.js";

/** 本地化文案（进 UI；不含任何实参值）。 */
export interface LocalizedText {
  readonly en: string;
  readonly [locale: string]: string;
}

/** 判定结果。与 DSH 的 `PreToolDecision` 对齐，外加 `ruleId` 供审计与诊断。 */
export type RouteDecision =
  | { readonly kind: "allow"; readonly ruleId: string; readonly reason: string }
  | { readonly kind: "deny"; readonly ruleId: string; readonly reason: string }
  | {
      readonly kind: "ask";
      readonly ruleId: string;
      readonly reason: string;
      readonly displayReason?: LocalizedText;
    }
  | { readonly kind: "cancel"; readonly ruleId: string; readonly reason: string };

/** 固定的 7 条路线顺序（L1）。导出供测试断言「顺序未被调整」。 */
export const POLICY_ROUTE_ORDER: readonly string[] = Object.freeze([
  "control",
  "interaction",
  "mandatory",
  "ordinary",
  "plan",
  "exemptions",
  "build",
]);

/** 项目规则集的最小形状（结构对齐 `PermissionRuleset`，避免跨包依赖）。 */
export interface ProjectRulesetLike {
  readonly allow?: readonly PermissionRuleLike[];
  readonly ask?: readonly PermissionRuleLike[];
  readonly deny?: readonly PermissionRuleLike[];
}

export interface PermissionRuleLike {
  readonly toolName: string;
  readonly ruleContent?: string;
}

/** 判定所需全部事实。全部只读；getter 形式保证惰性（K2）。 */
export interface PolicyFacts {
  /** 本次执行要用的模式（**入口快照**，B4/L2）。 */
  readonly mode: CollaborationMode;
  readonly toolName: string;
  readonly arguments: unknown;
  readonly capability: ResolvedCapability;
  readonly sessionId: string;
  /** 会话授权命中查询。**惰性**：只有需要时才调用。 */
  readonly readSessionGrants: () => boolean;
  /** 项目规则集。**惰性**：软约束才调用（K2）。 */
  readonly readProjectRules: () => ProjectRulesetLike | null | undefined;
  /** 会话工作目录。用于草稿免确认的路径判定（B12）。 */
  readonly workingDirectory?: string;
  /** 注入 path 实现（测试可传 `path.win32` / `path.posix`）。 */
  readonly pathModule?: PathModule;
  /** 会话级配置（由组合根提供；对应旧实现的 `PermissionConfig`，K4）。 */
  readonly config?: PolicySessionConfig;
}

/** 会话级权限配置（K4：类型在本包定义，值由组合根提供）。 */
export interface PolicySessionConfig {
  readonly allowedTools?: ReadonlySet<string>;
  readonly disallowedTools?: ReadonlySet<string>;
  readonly autoApproveHighRisk?: boolean;
}

/** 路径模块的最小形状（只要三个方法，便于注入 `path.win32` / `path.posix`）。 */
export interface PathModule {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (base: string, target: string) => string;
  readonly resolve: (...segments: string[]) => string;
}

/** Knorvia 的 plan 模式控制工具名（与 contracts 的常量一致）。 */
const ENTER_PLAN_MODE_TOOL = "EnterPlanMode";
const EXIT_PLAN_MODE_TOOL = "ExitPlanMode";
const AMEND_WORKFLOW_TOOL = "AmendWorkflow";
/** MCP 工具的 `permissionName`（plan 模式对其有单独一档白名单）。 */
const MCP_PERMISSION_NAME = "mcp";
/** edit 模式的 `permissionName`。 */
const EDIT_PERMISSION_NAME = "edit";
/** 草稿免确认只对这两个工具生效（它们共用 edit 权限名且只有一个 file_path 目标）。 */
const DRAFT_WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(["Edit", "Write"]);
/** 草稿目录（相对工作目录）。 */
const WORKFLOW_DRAFTS_DIR = ".knorvia-studio/workflow-drafts";
/** 父级片段（向上穿越的标记）。 */
const PARENT_SEGMENT = "..";
/** ApplyPatch 虽也是 edit，但输入是补丁正文、可一次改多文件，没有单一目标 → 不在草稿免确认内。 */

/** 计划模式是否生效：`mode === "plan"`。DSH 侧的 `planEnabled` 由组合根折进 mode。 */
function planActive(facts: PolicyFacts): boolean {
  return facts.mode === "plan";
}

/** 工具是否在「显式禁止」表里。 */
function isDisallowed(facts: PolicyFacts): boolean {
  return facts.config?.disallowedTools?.has(facts.toolName) === true;
}

/** 工具是否在「显式允许」表里。 */
function isExplicitlyAllowed(facts: PolicyFacts): boolean {
  return facts.config?.allowedTools?.has(facts.toolName) === true;
}

/**
 * AmendWorkflow 的「归属本会话」判定。
 *
 * 安全性：只有「本会话拥有且不是用户主动停止」的 run 才能免确认修改 —— 否则等于
 * 允许改别人的工作流。事实来自工具入参的 `predecessor`，本层不推测、不新建缓存
 * （与规格第 3 条「不接受本层推测」一致）。
 */
function ownsAmendedRun(facts: PolicyFacts): boolean {
  if (facts.toolName !== AMEND_WORKFLOW_TOOL) return false;
  const input = facts.arguments;
  if (input === null || typeof input !== "object") return false;
  const predecessor = (input as Record<string, unknown>).predecessor;
  if (predecessor === null || typeof predecessor !== "object") return false;
  const record = predecessor as Record<string, unknown>;
  return record.owned_by_this_session === true && record.stop_reason !== "user";
}

// ---------------------------------------------------------------------------
// ① 硬约束路线
// ---------------------------------------------------------------------------

/**
 * 硬约束：control / interaction / mandatory。
 *
 * **命中即短路，下游 Hook 看不到该调用。** 这是产品级硬约束，
 * 用户 Hook 无权推翻（README §一 3、D6）。
 *
 * @returns 终局决策；`undefined` 表示三条硬约束都没命中，可继续走软约束。
 */
export function evaluateHardRoutes(facts: PolicyFacts): RouteDecision | undefined {
  // ── ① control ─────────────────────────────────────────────────────────────
  // EnterPlanMode 总是直接允许；ExitPlanMode 只在计划生效时允许（否则 deny）。
  if (facts.toolName === ENTER_PLAN_MODE_TOOL) {
    return allow("tool.plan.enter", "Entering plan mode needs no permission prompt");
  }
  if (facts.toolName === EXIT_PLAN_MODE_TOOL && !planActive(facts)) {
    return deny("mode.plan.exitOnly", "ExitPlanMode is only available while plan mode is active");
  }

  // ── ② interaction ────────────────────────────────────────────────────────
  // 需要用户交互的工具：先看显式禁止，其余一律要求确认。
  // 这一档优先于 auto / 项目规则 / alwaysAsk / 会话规则 —— 规格第 2 条。
  if (facts.capability.requiresUserInteraction) {
    if (isDisallowed(facts)) {
      return deny("rule.disallowedTools", `Tool ${facts.toolName} is explicitly disallowed`);
    }
    return ask("tool.userInteraction", `Tool ${facts.toolName} requires user interaction`);
  }

  // ── ③ mandatory ──────────────────────────────────────────────────────────
  // 工具自己声明「必须确认」时，按固定顺序结算：
  // auto→deny / disallowed→deny / 项目deny→deny / 可用会话allow→allow /
  // 本会话的 AmendWorkflow→allow / 其他→ask
  if (facts.capability.alwaysAsk) {
    if (facts.mode === "auto") {
      return deny("mode.auto.unimplemented", AUTO_UNIMPLEMENTED_REASON);
    }
    if (isDisallowed(facts)) {
      return deny("rule.disallowedTools", `Tool ${facts.toolName} is explicitly disallowed`);
    }
    // 项目 deny 优先于会话 allow —— 规格第 3 条明确「项目 ask / allow 不能绕开它」，
    // 但项目 deny 仍要生效。
    if (matchesProjectRules(facts, "deny")) {
      return deny(
        "rule.project.deny",
        `Tool ${facts.toolName} is denied by project permission rules`,
      );
    }
    // 会话授权（`allowSessionApproval` 未显式禁止时可用）—— 规格第 3 条「可用会话 allow」。
    if (facts.capability.allowSessionApproval && facts.readSessionGrants()) {
      return allow("rule.session.allow", `Tool ${facts.toolName} was allowed for this session`);
    }
    if (ownsAmendedRun(facts)) {
      return allow(
        "rule.session.workflowOwner",
        `Tool ${facts.toolName} amends a run this session started`,
      );
    }
    return ask("tool.alwaysAsk", `Tool ${facts.toolName} always requires explicit approval`);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// ② 软约束路线
// ---------------------------------------------------------------------------

/**
 * 软约束：ordinary / plan / exemptions / build。
 *
 * **在下游 Hook 放行之后应用**：Hook 可以参与（它的 `allow` 不会推翻这里的 `ask`/`deny`，
 * 但它的 `deny` 已被 index.ts 尊重）。这是「产品策略」层。
 *
 * @returns 终局决策（软约束阶段**总是**给出结论，不会返回 undefined）
 */
export function evaluateSoftRoutes(facts: PolicyFacts): RouteDecision {
  // ── ④ ordinary ───────────────────────────────────────────────────────────
  // 非计划 yolo 放行；auto 拒绝；然后禁用表、项目 deny、项目 ask。
  // ⚠️ 进入本路线时模式已快照（B4），下游改注册表不影响本次。
  if (facts.mode === "yolo" && !planActive(facts)) {
    return allow("mode.yolo", "Yolo mode bypasses permission prompts");
  }
  if (facts.mode === "auto") {
    return deny("mode.auto.unimplemented", AUTO_UNIMPLEMENTED_REASON);
  }
  if (isDisallowed(facts)) {
    return deny("rule.disallowedTools", `Tool ${facts.toolName} is explicitly disallowed`);
  }
  if (matchesProjectRules(facts, "deny")) {
    return deny(
      "rule.project.deny",
      `Tool ${facts.toolName} is denied by project permission rules`,
    );
  }
  if (matchesProjectRules(facts, "ask")) {
    return ask(
      "rule.project.ask",
      `Tool ${facts.toolName} requires approval by project permission rules`,
    );
  }

  // ── ⑤ plan ───────────────────────────────────────────────────────────────
  // 计划生效时只允许三类能力，其余拒绝；且**不读项目 allow 或普通免确认规则**（规格第 5 条）。
  if (planActive(facts)) {
    if (facts.capability.readOnly && !facts.capability.destructive) {
      return allow("mode.plan.readOnly", "Plan mode allows read-only tool execution");
    }
    if (facts.capability.permissionName === MCP_PERMISSION_NAME && !facts.capability.destructive) {
      return allow("mode.plan.mcp", "Plan mode allows non-destructive MCP tool execution");
    }
    if (
      facts.capability.allowedInPlanMode &&
      facts.capability.sideEffectScope === "session" &&
      !facts.capability.destructive &&
      !facts.capability.needsApproval
    ) {
      return allow(
        "mode.plan.explicitSessionCapability",
        "Plan mode allows this explicit non-destructive session control action",
      );
    }
    return deny("mode.plan.nonReadOnly", "Plan mode only allows read-only, non-destructive tools");
  }

  // ── ⑥ exemptions ─────────────────────────────────────────────────────────
  // 非计划依次为项目 allow、预批准 WebFetch、草稿写入、allowedTools，然后 edit 模式的 edit 工具。
  // **草稿与 WebFetch 不能越过项目 deny / ask**（已在上面判过）。
  if (matchesProjectRules(facts, "allow")) {
    return allow(
      "rule.project.allow",
      `Tool ${facts.toolName} is allowed by project permission rules`,
    );
  }
  if (isPreapprovedWebFetch(facts)) {
    return allow("tool.webfetch.preapproved", "WebFetch URL is preapproved");
  }
  if (isPreapprovedWorkflowDraftWrite(facts)) {
    return allow("tool.workflowDraft.preapproved", "Workflow draft file is preapproved");
  }
  if (isExplicitlyAllowed(facts)) {
    return allow("rule.allowedTools", `Tool ${facts.toolName} is explicitly allowed`);
  }
  if (
    facts.mode === "edit" &&
    facts.capability.permissionName === EDIT_PERMISSION_NAME &&
    facts.capability.sideEffectScope === "workspace"
  ) {
    return allow("mode.edit.fileEdit", "Edit mode allows workspace file edit tools");
  }

  // ── ⑦ build ──────────────────────────────────────────────────────────────
  return evaluateBuildRoute(facts);
}

/** build 路线的六步（规格第 7 条）。 */
function evaluateBuildRoute(facts: PolicyFacts): RouteDecision {
  const capability = facts.capability;
  if (capability.readOnly && !capability.destructive && !capability.needsApproval) {
    return allow("mode.build.readOnly", "Build mode allows read-only tools that need no approval");
  }
  if (capability.riskLevel === "critical") {
    return ask("mode.build.criticalRisk", "Critical risk tools require explicit approval");
  }
  if (capability.riskLevel === "high" && facts.config?.autoApproveHighRisk !== true) {
    return ask("mode.build.highRisk", "High risk tools require explicit approval");
  }
  if (
    capability.sideEffectScope === "session" &&
    capability.riskLevel === "low" &&
    !capability.destructive &&
    !capability.needsApproval
  ) {
    return allow(
      "mode.build.sessionState",
      "Build mode allows low-risk session-local state updates",
    );
  }
  if (capability.needsApproval || capability.destructive || capability.sideEffectScope !== "none") {
    return ask("mode.build.sideEffect", "Tool has side effects and requires approval");
  }
  return allow("mode.build.lowRisk", "Build mode allows low-risk tool execution");
}

// ---------------------------------------------------------------------------
// 项目规则匹配
// ---------------------------------------------------------------------------

/**
 * 项目规则匹配（行为对齐 specs/knorvia-permission-rule-matching.md）。
 *
 * **惰性**：`readProjectRules` 只在本函数被调用时读一次（K2）。
 * 每条规则匹配前**重新判 scope**：前条内容回调可能改变后条范围（规格第 6 条的注释）。
 */
function matchesProjectRules(facts: PolicyFacts, behavior: "allow" | "ask" | "deny"): boolean {
  const ruleset = facts.readProjectRules();
  if (ruleset === null || ruleset === undefined) return false;
  const category = ruleset[behavior];
  if (!Array.isArray(category)) return false;

  for (const rule of category) {
    if (rule.toolName !== facts.toolName) continue;
    if (rule.ruleContent === undefined) return true;
    const subject = selectRuleSubject(facts);
    if (subject === undefined) continue;
    const program = compileRuleContent(rule.ruleContent, subject.isWebFetch);
    const targets = subject.isWebFetch ? webFetchRuleSubjects(subject.value) : [subject.value];
    // URL 类规则按整串比较；其他类别按主体（WebFetch 时为域名主体）比较。
    const compared = program.kind === "url" ? [subject.value] : targets;
    if (compared.length === 0) continue;
    if (compared.some((item) => evaluateRuleContent(program, item))) return true;
  }
  return false;
}

/** 取规则匹配用的主体串（与 `session-grants.ts` 的取值顺序一致）。 */
function selectRuleSubject(facts: PolicyFacts): { value: string; isWebFetch: boolean } | undefined {
  const raw = facts.arguments;
  if (typeof raw === "string") return { value: raw, isWebFetch: false };
  if (raw === null || typeof raw !== "object") return undefined;
  const fields = raw as Record<string, unknown>;
  if (facts.toolName === WEB_FETCH_TOOL) {
    const url = fields.url;
    if (typeof url === "string") return { value: url, isWebFetch: true };
  }
  for (const field of RULE_SUBJECT_FIELDS) {
    const value = fields[field];
    if (typeof value === "string") return { value, isWebFetch: false };
  }
  return undefined;
}

/** WebFetch 工具名。 */
const WEB_FETCH_TOOL = "WebFetch";

/** 主体字段取值顺序（`command` 在最前：Bash 的命令前缀匹配依赖它）。 */
const RULE_SUBJECT_FIELDS: readonly string[] = [
  "command",
  "url",
  "file_path",
  "path",
  "pattern",
  "patch_text",
];

/** 预批准 WebFetch：只在本包拿到 URL 且判定为预批准域时成立。 */
function isPreapprovedWebFetch(facts: PolicyFacts): boolean {
  if (facts.toolName !== WEB_FETCH_TOOL) return false;
  const raw = facts.arguments;
  if (raw === null || typeof raw !== "object") return false;
  const url = (raw as Record<string, unknown>).url;
  if (typeof url !== "string") return false;
  // 预批准域列表由组合根通过读规则提供；这里只判「是否命中预批准」这一层语义。
  return (
    facts
      .readProjectRules()
      ?.allow?.some((rule) => rule.toolName === WEB_FETCH_TOOL && rule.ruleContent === url) === true
  );
}

/**
 * 草稿目录免确认（B12）。
 *
 * 安全性：草稿目录由工具自己写、带 `.gitignore` 不进版本库，用户不会往里放要保护的东西；
 * 而「让脚本真正跑起来」另有 CreateWorkflow 的 `alwaysAsk` 闸门。
 * 所以放行**写入**不等于放行**执行**。
 *
 * 判定只比路径字符串：不 `realpath`、不 `stat` —— 一次磁盘读失败不能把
 * 「不放行」变成「放行」。
 */
function isPreapprovedWorkflowDraftWrite(facts: PolicyFacts): boolean {
  if (!DRAFT_WRITE_TOOL_NAMES.has(facts.toolName)) return false;
  const workingDirectory = facts.workingDirectory;
  // 拿不到工作目录就算不出目标落在哪 → 不免确认（该弹的窗照弹）。
  if (typeof workingDirectory !== "string" || workingDirectory.length === 0) return false;
  const raw = facts.arguments;
  if (raw === null || typeof raw !== "object") return false;
  const filePath = (raw as Record<string, unknown>).file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return false;

  const path = facts.pathModule;
  if (path === undefined) return false;
  const draftsDirectory = path.resolve(workingDirectory, WORKFLOW_DRAFTS_DIR);
  const target = path.resolve(workingDirectory, filePath);
  const relative = path.relative(draftsDirectory, target);
  // 三个条件缺一不可：非空（排除「目标就是目录本身」）、非绝对（Windows 跨盘符）、不以 `..` 开头。
  if (relative.length === 0) return false;
  if (path.isAbsolute(relative)) return false;
  return !relative.startsWith(PARENT_SEGMENT);
}

// ---------------------------------------------------------------------------
// 决策构造器（集中一处，保证 reason 稳定且不含实参值 —— B11/L9）
// ---------------------------------------------------------------------------

const AUTO_UNIMPLEMENTED_REASON = "Auto mode is reserved but not implemented yet";

function allow(ruleId: string, reason: string): RouteDecision {
  return { kind: "allow", ruleId, reason };
}

function deny(ruleId: string, reason: string): RouteDecision {
  return { kind: "deny", ruleId, reason };
}

function ask(ruleId: string, reason: string): RouteDecision {
  return { kind: "ask", ruleId, reason };
}

/**
 * 路线耗尽的兜底（K3）。
 *
 * **不抛错**：DSH 侧异常可能导致管线失败并走默认放行 —— 那会违反 fail closed。
 * 所以这里返回 `deny`，同时把 `ruleId` 留给调用方记 `error` 日志
 * （保留「这是异常情形」的信号）。
 */
export function routeExhausted(): RouteDecision {
  return {
    kind: "deny",
    ruleId: "route.exhausted",
    reason: "Permission policy reached no conclusion; denying by default",
  };
}

/** 取消（B7）：父 signal 已中止时使用，**不用 `deny`**（取消不是拒绝语义）。 */
export function cancelledDecision(): RouteDecision {
  return {
    kind: "cancel",
    ruleId: "request.cancelled",
    reason: "Permission check cancelled by the caller",
  };
}

export type { SideEffectScope };
