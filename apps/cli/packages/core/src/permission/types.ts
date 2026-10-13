import type * as contracts from "@knorvia/contracts";

export interface PermissionContext {
  toolName: string;
  input: unknown;
  riskLevel: contracts.RiskLevel;
  mode: contracts.CollaborationMode;
  planEnabled?: boolean;
  prePlanMode?: Exclude<contracts.CollaborationMode, "plan">;
  /**
   * 会话工作目录。判定相对路径的落点用（目前只有 workflow 草稿免确认这一条），
   * 可选：拿不到工作目录的调用方照常按其余规则判定，不会因此少一层确认。
   */
  workingDirectory?: string;
}

export interface PermissionToolCapability {
  allowedInPlanMode?: boolean;
  alwaysAsk?: boolean;
  readOnly?: boolean;
  destructive?: boolean;
  requiresUserInteraction?: boolean;
  sideEffectScope?: contracts.ModelToolSideEffectScope;
  riskLevel?: contracts.RiskLevel;
  needsApproval?: boolean;
  permissionCapabilityGroup?: contracts.PermissionCapabilityGroup;
  permission?: contracts.ToolPermissionSpec;
}

export type PermissionBehavior = "allow" | "ask" | "deny";

export interface PermissionDecisionResult {
  decision: PermissionBehavior;
  allowed: boolean;
  reason?: string;
  modifiedInput?: unknown;
  escalated: boolean;
  mode: contracts.CollaborationMode;
  ruleId: string;
  riskLevel: contracts.RiskLevel;
  sideEffectScope?: contracts.ModelToolSideEffectScope;
  /**
   * 该 ask 来自工具的 alwaysAsk 声明，不是模式或规则推导出来的。下游（PreToolUse hook 的
   * allow 覆盖）靠这个结构化标记识别"不可抹掉的确认"，而不是去匹配 ruleId 字符串。
   */
  alwaysAsk?: boolean;
}

export interface ResolvedPermissionCapability {
  allowSessionApproval: boolean;
  allowedInPlanMode: boolean;
  alwaysAsk: boolean;
  readOnly: boolean;
  destructive: boolean;
  requiresUserInteraction: boolean;
  sideEffectScope: contracts.ModelToolSideEffectScope;
  riskLevel: contracts.RiskLevel;
  needsApproval: boolean;
  permissionCapabilityGroup?: contracts.PermissionCapabilityGroup;
  permissionName?: string;
}

// 权限配置与决策形状：默认配置、行为枚举、工具能力与解析结果都在这一节。

export interface PermissionConfig {
  allowedTools: Set<string>;
  disallowedTools: Set<string>;
  autoApproveHighRisk: boolean;
  allowMediumRiskInAutoMode: boolean;
}

export const defaultPermissionConfig: PermissionConfig = {
  allowedTools: new Set(),
  disallowedTools: new Set(),
  autoApproveHighRisk: false,
  allowMediumRiskInAutoMode: false,
};
