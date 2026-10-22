// SPDX-License-Identifier: Apache-2.0
// Knorvia Core 包根：按领域分组再导出各子模块的公开面。
//
// 两条容易踩的约定：
// 1. 纯类型必须走 `export type`（含内联 `type` 修饰符）：源码入口用 tsx/ESM 直接加载包根时，
//    类型名没有运行时绑定，写成值导出会抛 "does not provide an export named '…'"。
// 2. 已保存工作流的 codec（解析/序列化/路径解析）只有这一份实现：写侧与读侧一旦各自演化，
//    症状是「刚保存的 workflow 列不出来」，所以这里集中导出，bootstrap 不再另抄一份。

// —— Agent、上下文与压缩 ——
export * from "./agent/index.js";
export * from "./compact/index.js";
export * from "./context/index.js";
export { resolveProjectMemoryRoot } from "./memory/project-root.js";

// —— 工具：调度、注册表、执行器、权限准备、内置处理器 ——
export {
  READ_ONLY_TOOLS,
  ToolScheduler,
  defaultToolScheduler,
  type ToolDependency,
  type ToolSchedule,
  type ToolScheduleItem,
} from "./tool/scheduler.js";
export { ToolRegistryImpl, createToolRegistry, type ToolRegistry } from "./tool/registry.js";
export { ToolExecutorImpl, createToolExecutor, type ToolExecutor } from "./tool/executor.js";
export {
  PermissionPreparation,
  activatePermissionRequest,
  awaitPermissionPreparation,
  mapPreparedPermission,
} from "./permission/prepared-request.js";
export { builtInTools, registerBuiltInTools } from "./tool/handlers/index.js";
export {
  createSubmitResultToolEntry,
  submitResultToolEntry,
} from "./tool/handlers/submit-result.js";
export {
  DEFAULT_BASH_MAX_TIMEOUT_MS,
  DEFAULT_BASH_TIMEOUT_MS,
  DEFAULT_BASH_TIMEOUT_POLICY,
  resolveBashTimeoutMs,
  resolveBashTimeoutPolicy,
  type BashTimeoutPolicy,
} from "./tool/bash-timeout-policy.js";
export type {
  ExecutableToolCall,
  ToolBatchEvent,
  ToolBatchResult,
  ToolEntry,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
  ToolMetadata,
  ToolResultSerialization,
} from "./tool/types.js";

// —— 已保存工作流：store / codec ——
export {
  SAVED_WORKFLOW_SENTINEL,
  findSavedWorkflowShadowing,
  listSavedWorkflows,
  moveSavedWorkflow,
  parseSavedWorkflow,
  resolveSavedWorkflow,
  saveSavedWorkflow,
  savedWorkflowExists,
  savedWorkflowFileName,
  savedWorkflowPath,
  savedWorkflowRoot,
  savedWorkflowRoots,
  serializeSavedWorkflow,
  validateWorkflowArgs,
  type ResolvedSavedWorkflow,
  type SavedWorkflowListResult,
  type SavedWorkflowMoveResult,
  type SavedWorkflowParseErrorReason,
  type SavedWorkflowParseResult,
  type SavedWorkflowResolveFailure,
  type SavedWorkflowResolveResult,
  type SavedWorkflowRoot,
  type SavedWorkflowRootsOptions,
  type WorkflowArgsValidation,
} from "./tool/handlers/saved-workflows/index.js";

// —— Hooks、MCP 与插件对话引用 ——
export * from "./hooks/index.js";
export * from "./mcp/index.js";
export * from "./plugin-reference/index.js";

// —— Node REPL / browser-use 运行时原语 ——
export { NodeReplSession } from "./repl/node-repl-session.js";
export type {
  NodeReplCuaAppIdentity,
  NodeReplImage,
  NodeReplRequestMeta,
  NodeReplRunResult,
  NodeReplSessionOptions,
  NodeReplStructuredResult,
} from "./repl/node-repl-session.js";

// 2026-10-23 移出：`setupBrowserRuntime` / `BrowserClientTransport` 已随 #302
// 迁到独立包 `@knorvia/browser-client`。core 内那份是逐字节相同的重复副本，
// 且包外零引用（唯一使用者 `tool/repl/session-registry.ts` 已改指独立包）。
// 所以这里不再从 core 导出它们 —— 消费方应直接 `import from "@knorvia/browser-client"`。

// —— 子代理与运行时任务 ——
export * from "./subagent/index.js";
export * from "./runtime-task/index.js";

// —— 工作流：定义、专家运行时、生命周期、调度器 ——
export * from "./workflow/definition.js";
export * from "./workflow/expert.js";
export * from "./workflow/lifecycle.js";
export * from "./workflow/scheduler.js";

// —— 权限：broker、服务与配置 ——
export {
  DenyPermissionBroker,
  ManualPermissionBroker,
  PermissionService,
  createDenyPermissionBroker,
  createManualPermissionBroker,
  defaultPermissionConfig,
  type ManualPermissionBrokerOptions,
  type PermissionBehavior,
  type PermissionConfig,
  type PermissionContext,
  type PermissionDecisionResult,
  type PermissionToolCapability,
} from "./permission/index.js";

// —— 运行时：AgentRuntime、转录克隆与路径修复 ——
export { AgentRuntime } from "./runtime.js";
export { createExternalTurnFaultError } from "./runtime/helpers/turn-errors.js";
export { repairPersistedRemoteSessionPaths } from "./runtime/helpers/persisted-remote-session-path-repair.js";
export { cloneMessageForFork, clonePartForFork } from "./runtime/helpers/steering.js";
export type {
  ChildClientPortsContext,
  ClientFacingPorts,
} from "./runtime/helpers/child-client-ports.js";
export type {
  ActiveTurnInfo,
  AgentRuntimeConfig,
  AgentRuntimeDeps,
  AmendWorkflowRunSettingsInput,
  AmendWorkflowRunSettingsResult,
  ConversationRewindResult,
  ExecuteTurnOptions,
  ModelExecutionContext,
  PromptAdmissionOptions,
  PromptAdmissionReceipt,
  ProviderRuntimeHeadersPort,
  ResumeSessionOptions,
  ResumeSessionResult,
  RuntimeFactory,
  StartSavedWorkflowRunResult,
  TurnResult,
  WorkspaceCheckpointSummary,
  WorkspaceFileRewindApplyResult,
  WorkspaceFileRewindPreview,
  WorkspaceForkResult,
  WorkspaceGenerateTextInput,
  WorkspaceGenerateTextResult,
  WorkspaceRewindRestoredFile,
  WorkspaceRewindResult,
} from "./runtime.js";

// —— 输出与环境信息 ——
export { color, formatJson, supportsColor } from "./output.js";
export { getRuntimeInfo } from "./environment.js";
export type { RuntimeInfo } from "./environment.js";

// —— 契约层：日志与会话事件 ——
export {
  LogLevel,
  SessionEventType,
  type LogContext,
  type LogEntry,
  type Logger,
  type LoggerFactory,
  type SessionEvent,
  type SessionEventSink,
} from "@knorvia/contracts";
