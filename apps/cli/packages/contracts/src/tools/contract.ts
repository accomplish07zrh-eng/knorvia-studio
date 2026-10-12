// SPDX-License-Identifier: Apache-2.0
// 工具契约共享面的公开入口：只做再导出。
// 声明在 contract-declarations.ts，两个副作用范围判定在 tool-scope-predicates.ts；
// 兼容面名字见 contracts-02 的 interface.md。
export {
  WORKSPACE_MUTATING_SIDE_EFFECT_SCOPES,
  isWorldTouchingToolCall,
  isWorkspaceMutatingToolCall,
} from "./tool-scope-predicates.js";

export type {
  NoToolTimeoutPolicy,
  ProviderNativeToolSpec,
  TimedToolTimeoutPolicy,
  ToolCancellationPolicy,
  ToolContractDeclaration,
  ToolExecutionMode,
  ToolPermissionPatternSource,
  ToolPermissionSpec,
  ToolResultBudget,
  ToolResultBudgetStrategy,
  ToolSideEffectScope,
  ToolTimeoutPolicy,
  ToolTracePolicy,
} from "./contract-declarations.js";
