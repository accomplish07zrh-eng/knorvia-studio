// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：能力解析。
//
// 契约依据：specs/contracts/kernel-plugin-policy/behavior.md B3、interface.md §四、
//           specs/knorvia-permission-policy.md「能力合同」。
//
// 核心约束（B3）：**逐属性独立** —— 一条覆写只影响它自己那个属性。
// 例如声明 `readOnly: true` 不能顺带把 `needsApproval` 变成 false；
// 每个字段都走「permission 子声明 → 顶层声明 → 工具名缺省表 → 硬编码缺省」这条链。

/** 副作用范围。六档 + 交互标记（与旧实现的 `ModelToolSideEffectScope` 对齐）。 */
export type SideEffectScope =
  | "none"
  | "workspace"
  | "session"
  | "git"
  | "network"
  | "system"
  | "userInteraction";

/** 风险等级。 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * 工具能力声明。全部可选：未声明的字段回落到工具名缺省表。
 *
 * 字段按「语义组」分三段列出而不是平铺：
 * ① 只读性与破坏性（决定能不能做）
 * ② 副作用范围与风险等级（决定要多严）
 * ③ 审批与计划模式（决定要不要问、能不能在 plan 里做）
 *
 * 分组的实际好处是让每个字段的用途在阅读时自解释；三组各自有独立语义，
 * 后续新增字段时也知道该挂到哪一组。
 */
export interface ToolCapabilityDeclaration {
  // ① 只读性与破坏性：这两个决定「能不能做」，与风险等级正交。
  readonly readOnly?: boolean;
  readonly destructive?: boolean;

  // ② 副作用范围与风险等级：决定「要多严」。范围是结构性的，等级是评估性的。
  readonly sideEffectScope?: SideEffectScope;
  readonly riskLevel?: RiskLevel;

  // ③ 审批与计划模式：决定「要不要问」以及「计划模式下能不能做」。
  readonly needsApproval?: boolean;
  readonly requiresUserInteraction?: boolean;
  readonly allowedInPlanMode?: boolean;
  readonly alwaysAsk?: boolean;

  /**
   * Knorvia 的 `ToolPermissionSpec` 子声明。**优先级高于上面的顶层字段** ——
   * 工具插件用这个结构表达「权限名叫什么、以及它自己的审批选项」。
   */
  readonly permission?: ToolPermissionSpecDeclaration;

  /** 能力分组（用于「整组许可」场景，如官方 CUA 规则）。 */
  readonly permissionCapabilityGroup?: string;
}

/**
 * `ToolPermissionSpec` 的子声明形状。
 *
 * 单独提出来的原因：它既是**字段类型**（被 `permission` 引用），
 * 又是一个**语义边界** —— 这一层的字段覆盖顶层同名字段。
 * 平铺回去会让「谁是覆盖者」在类型上不可见。
 */
export interface ToolPermissionSpecDeclaration {
  /** 权限名（如 `edit` / `mcp` / `bash`）。判定用它区分能力类别。 */
  readonly permission?: string;
  readonly sideEffectScope?: SideEffectScope;
  readonly riskLevel?: RiskLevel;
  readonly needsApproval?: boolean;
  readonly alwaysAsk?: boolean;
  /** 审批选项：`allowAlways === false` 表示**禁止**「本次会话都允许」。 */
  readonly askOptions?: { readonly allowAlways?: boolean };
}

/** 解析后的能力。全部字段都有值（无 undefined），供判定直接消费。 */
export interface ResolvedCapability {
  readonly allowedInPlanMode: boolean;
  readonly alwaysAsk: boolean;
  readonly allowSessionApproval: boolean;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly requiresUserInteraction: boolean;
  readonly sideEffectScope: SideEffectScope;
  readonly riskLevel: RiskLevel;
  readonly needsApproval: boolean;
  readonly permissionCapabilityGroup?: string;
  readonly permissionName?: string;
}

/** 工具名缺省档。 */
interface NameDefaults {
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly sideEffectScope: SideEffectScope;
  readonly needsApproval: boolean;
  readonly riskLevel: RiskLevel;
}

/** 未知名档：**更严格**（非只读 / 需批准 / medium）。新增工具忘记登记时后果是收紧而非放宽。 */
const UNKNOWN_DEFAULTS: Readonly<NameDefaults> = Object.freeze({
  readOnly: false,
  destructive: false,
  sideEffectScope: "workspace",
  needsApproval: true,
  riskLevel: "medium",
});

/** 只读档。 */
const READ_ONLY_DEFAULTS: Readonly<NameDefaults> = Object.freeze({
  readOnly: true,
  destructive: false,
  sideEffectScope: "none",
  needsApproval: false,
  riskLevel: "low",
});

/**
 * 只读工具清单（既有产品政策，**原样保留**）。
 *
 * `TodoWrite` 与 `AskUserQuestion` 名字看起来像写操作／需要交互，但既有政策把它们归在只读组：
 * 前者只改会话内待办（`none` 范围），后者虽然弹 UI 但既有实现不把它当
 * `requiresUserInteraction`（那一档留给真正阻塞式交互的工具）。
 * **改变这张表就是改变用户可感知的确认频率** → 属产品决策，须先改
 * `specs/knorvia-permission-policy.md`。
 *
 * 用「按能力来源分组」的结构表达，而不是一条平铺清单：
 * 分组本身携带信息（新工具该归哪类一目了然），也让这张表在阅读时能回答
 * 「为什么这四类都算只读」—— 因为它们的副作用分别落在文件系统之外、
 * 远端可重放、会话内存内、或另一个代理里。
 */
const READ_ONLY_TOOL_GROUPS = {
  /** 读文件系统：只读取，不落盘。 */
  filesystem: ["Read", "Glob", "Grep"],
  /** 读网络：检索与抓取，副作用在远端且可重放。 */
  network: ["WebSearch", "WebFetch"],
  /** 读会话状态：待办读写与会话内提问，范围是 `none`（不改工作区）。 */
  session: ["TodoRead", "TodoWrite", "AskUserQuestion"],
  /** 派活：把工作交给子代理或技能，本层不直接产生副作用。 */
  delegate: ["Agent", "Task", "Skill"],
} as const satisfies Record<string, readonly string[]>;

/** 只读工具名（由四组展平；顺序 = 组顺序 × 组内顺序）。 */
const READ_ONLY_TOOL_NAMES: readonly string[] = Object.values(READ_ONLY_TOOL_GROUPS).flat();

/** `Bash` 特殊档：未知名 + destructive。 */
const BASH_DEFAULTS: Readonly<NameDefaults> = Object.freeze({
  ...UNKNOWN_DEFAULTS,
  destructive: true,
});

/** 工具名 → 缺省档。漂移检测（`tool-catalogue.ts`）会读它判断「有工具但未登记」。 */
export const NAME_DEFAULTS: ReadonlyMap<string, Readonly<NameDefaults>> = new Map([
  ...READ_ONLY_TOOL_NAMES.map(
    (name) => [name, READ_ONLY_DEFAULTS] as readonly [string, Readonly<NameDefaults>],
  ),
  ["Bash", BASH_DEFAULTS] as readonly [string, Readonly<NameDefaults>],
]);

/** 工具是否在缺省表里（漂移检测用）。 */
export function hasNameDefault(toolName: string): boolean {
  return NAME_DEFAULTS.has(toolName);
}

/** 缺省表覆盖的工具名（漂移检测与测试用）。 */
export function knownToolNames(): readonly string[] {
  return Array.from(NAME_DEFAULTS.keys());
}

/**
 * 解析一个工具的能力。
 *
 * 逐属性优先级（B3）：
 * `permission.<field>` → 顶层 `<field>` → 工具名缺省表 → 硬编码缺省。
 *
 * @param toolName 工具名
 * @param declaration 工具声明；`undefined` 表示该工具无声明（走缺省表）
 */
export function resolveCapability(
  toolName: string,
  declaration: ToolCapabilityDeclaration | undefined,
): ResolvedCapability {
  const defaults = NAME_DEFAULTS.get(toolName) ?? UNKNOWN_DEFAULTS;
  const declared = declaration?.permission;
  // 显式声明的副作用范围可能来自子声明或顶层；它是 `requiresUserInteraction` 的推导输入之一。
  const explicitScope = declared?.sideEffectScope ?? declaration?.sideEffectScope;
  return {
    allowedInPlanMode: declaration?.allowedInPlanMode ?? false,
    alwaysAsk: declared?.alwaysAsk ?? declaration?.alwaysAsk ?? false,
    // `allowAlways !== false`：只有显式禁止才关闭会话授权（缺省允许）。
    allowSessionApproval: declared?.askOptions?.allowAlways !== false,
    readOnly: declaration?.readOnly ?? defaults.readOnly,
    destructive: declaration?.destructive ?? defaults.destructive,
    requiresUserInteraction:
      declaration?.requiresUserInteraction ?? explicitScope === "userInteraction",
    sideEffectScope: explicitScope ?? defaults.sideEffectScope,
    riskLevel: declared?.riskLevel ?? declaration?.riskLevel ?? defaults.riskLevel,
    needsApproval: declared?.needsApproval ?? declaration?.needsApproval ?? defaults.needsApproval,
    permissionCapabilityGroup: declaration?.permissionCapabilityGroup,
    permissionName: declared?.permission,
  };
}

/**
 * 只解析风险等级（对应旧实现的 `getRiskLevel`）。
 *
 * 单独提供是因为有调用点只关心风险等级、不需要完整能力（旧实现的
 * `PermissionService.getRiskLevel` 就是这么用的）。
 */
export function resolveRiskLevel(
  toolName: string,
  declaration: ToolCapabilityDeclaration | undefined,
): RiskLevel {
  return resolveCapability(toolName, declaration).riskLevel;
}
