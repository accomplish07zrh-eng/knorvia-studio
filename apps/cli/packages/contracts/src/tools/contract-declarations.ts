// SPDX-License-Identifier: Apache-2.0
// 工具契约的共享声明面：副作用范围、权限、结果预算、超时、取消与追踪策略的类型。
// 两个判定函数（是否改写工作区 / 是否触碰外部世界）在 tool-scope-predicates.ts。
import type { RiskLevel } from "../interfaces/session.port.js";

export type ToolSideEffectScope =
  | "none"
  | "workspace"
  | "git"
  | "network"
  | "system"
  | "session"
  | "userInteraction";

export type ToolPermissionPatternSource =
  | "none"
  | "toolName"
  | "input"
  | "path"
  | "command"
  | "network"
  | "custom";

export type ToolResultBudgetStrategy = "inline" | "truncate" | "artifact";

export type ToolExecutionMode = "client" | "providerNative";

export interface ProviderNativeToolSpec {
  kind: "provider_native";
  logicalName: string;
  providerToolName: string;
  providerIds?: string[];
  args?: Record<string, unknown>;
  fallback: "disabled";
}

export interface ToolPermissionSpec {
  permission: string;
  reason: string;
  riskLevel: RiskLevel;
  sideEffectScope: ToolSideEffectScope;
  needsApproval: boolean;
  patternSources: ToolPermissionPatternSource[];
  alwaysAllowPatternSources?: ToolPermissionPatternSource[];
  denyPriority: "beforeAsk" | "afterStaticAllow";
  // 每种权限模式下都要求用户显式批准。与 needsApproval 不同：后者允许宽松模式短路，
  // 这个必须穿过 yolo 与计划模式的只读通道——这类工具的工作单元足够大，任何宽松设置都不该
  // 让它无人值守地跑起来。它只覆盖「放行」分支，不覆盖「拒绝」分支：显式禁用的工具仍然禁用。
  alwaysAsk?: true;
  // 收紧本工具提问时给出的选项。allowAlways: false 抑制持久化的项目级规则：输入每次都是不同
  // 代码的工具无法在记住一次决定的同时不永久关闭它的闸门。"session" 把持久规则换成
  // 内存里的会话级规则（「本会话内总是允许」）：闸门只在本运行时内保持打开，
  // 每个新会话（重启、冷恢复、/new）都要重新询问。
  askOptions?: { allowAlways: false | "session" };
}

export interface ToolResultBudget {
  // 结果在被摘要、截断或改为落盘之前的内联 UI/事件阈值。
  maxInlineBytes: number;
  // provider 可见的内联阈值。artifact 策略下这是触发落盘的阈值；
  // 成功落盘的 <persisted-output> 预览使用它自己的预览预算。
  maxModelBytes: number;
  strategy: ToolResultBudgetStrategy;
  preview?: {
    maxBytes?: number;
    maxLines?: number;
    direction?: "head" | "tail";
  };
  artifact?: {
    enabled: boolean;
    retention?: "session" | "project" | "temporary";
  };
}

export interface NoToolTimeoutPolicy {
  kind: "none";
}

export interface TimedToolTimeoutPolicy {
  kind?: "timed";
  defaultMs: number;
  maxMs?: number;
  allowCallOverride: boolean;
  // 工具自身超时之后，为取消与 adapter 清理预留的额外墙钟预算。
  // 用户看到的超时仍由 defaultMs / 入参决定。
  cleanupGraceMs?: number;
}

export type ToolTimeoutPolicy = NoToolTimeoutPolicy | TimedToolTimeoutPolicy;

export interface ToolCancellationPolicy {
  supported: boolean;
  cleanup: "none" | "bestEffort" | "required";
  userVisibleMessage: string;
}

export interface ToolTracePolicy {
  required: true;
  propagateToAdapters: boolean;
  recordInput: "summary" | "full" | "none";
  recordOutput: "summary" | "full" | "none";
}

export interface ToolContractDeclaration {
  capability: string;
  executionMode?: ToolExecutionMode;
  providerNative?: ProviderNativeToolSpec;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  // 声明 inputSchema 有资格走 provider 的严格模式（Anthropic strict: true，用 constrained
  // decoding 保证 tool_use.input 恰好满足 schema）。这只是资格而不是命令：adapter 按 provider /
  // model 决定是否真的下发，并负责把 strict 子集表达不了的关键字折进 description；
  // 缺席即不严格。首个使用者是 dwf mono 子代理的 typed submit_result。
  strict?: boolean;
  requiresUserInteraction?: boolean;
  permission: ToolPermissionSpec;
  resultBudget: ToolResultBudget;
  timeout: ToolTimeoutPolicy;
  cancellation: ToolCancellationPolicy;
  trace: ToolTracePolicy;
}
