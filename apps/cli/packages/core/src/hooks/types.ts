// SPDX-License-Identifier: Apache-2.0
// core-hooks 的公开类型面：调用方（含保留的 runner/output 文件与 bootstrap）按这些名字构造与消费对象。
// 字段名与可选性属兼容面（interface.md），实现内部不得新增必填字段。
import type {
  ExecutionPort,
  HookEventName,
  HookExecutionDescriptor,
  HookInput,
  HookJSONOutput,
  HookPermissionDecision,
  HookSourceKind,
  HooksRuntimeConfig,
  Logger,
  PermissionRequestHookDecision,
  SessionEvent,
  WorkspaceHookBundleSnapshot,
  WorkspaceHookPolicy,
  WorkspaceHookReasonCode,
} from "@knorvia/contracts";
import type { WorkspaceHookTrustCoordinator } from "./workspace-hook-trust-coordinator.js";


/** 回调收到的运行上下文：索引是运行器给的位置，abort 信号由运行器拥有。 */
export interface HookCallbackContext {
  hookIndex: number;
  signal?: AbortSignal;
}

/** 执行器附带的诊断信息。只用于阻断事件，不进入决策，也不回灌模型。 */
export interface HookCallbackDiagnostics {
  errorMessage?: string;
  stderrPreview?: string;
  stdoutPreview?: string;
}

/** 回调可以显式区分「输出」和「诊断」；直接返回 JSON 时诊断为空。 */
export interface HookCallbackResult {
  kind: "hookCallbackResult";
  diagnostics?: HookCallbackDiagnostics;
  output?: HookJSONOutput;
}

export type HookCallback = (
  input: HookInput,
  context: HookCallbackContext,
) => HookJSONOutput | HookCallbackResult | void | Promise<HookJSONOutput | HookCallbackResult | void>;

/** 准入判定。拒绝时 reasonCode 会进入事件与日志；skipLifecycle 表示不产生任何生命周期事件。 */
export interface HookRunAdmissionDecision {
  allowed: boolean;
  reasonCode?: string;
  skipLifecycle?: boolean;
}

/** 一条登记：事件 + 可选 matcher + 回调，可选描述符/准入/超时。 */
export interface HookRegistration {
  admission?: (input: HookInput) => HookRunAdmissionDecision;
  async?: boolean;
  callback: HookCallback;
  descriptor?: HookExecutionDescriptor | ((input: HookInput) => HookExecutionDescriptor);
  event: HookEventName;
  matcher?: string;
  source?: string;
  sourceKind?: HookSourceKind;
  timeoutMs?: number;
}

/** 单次运行的匹配值：matchValue 与 matchValues 取并集参与 matcher 判定。 */
export interface HookRunOptions {
  matchValue?: string;
  matchValues?: readonly string[];
  signal?: AbortSignal;
}

/** 一次运行累积出的结果；字段按合同 B9（保留文件）合并。 */
export interface HookRunResult {
  additionalContexts: string[];
  blockRequested?: boolean;
  hookPermissionDecisionReason?: string;
  permissionBehavior?: HookPermissionDecision;
  permissionRequestResult?: PermissionRequestHookDecision;
  preventContinuation?: boolean;
  stopShouldContinue?: boolean;
  stopReason?: string;
  updatedInput?: unknown;
}

export interface HookRunner {
  run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult>;
}

export interface HookRunnerOptions {
  defaultTimeoutMs?: number;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  hooks?: HookRegistration[];
  logger?: Logger;
}

export interface ConfiguredHookRunnerOptions {
  config: HooksRuntimeConfig;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort: ExecutionPort;
  getWorkingDirectory: () => string;
  logger?: Logger;
  workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
  workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
}

/**
 * 遥测事件名与字段属兼容面（字段名即跨模块约定），声明集中在本文件；
 * 运行时模块只负责发射，不再重复声明。
 */
export type WorkspaceHookTelemetryEvent =
  | "workspace_hook.feature_disabled"
  | "workspace_hook.review_request_created"
  | "workspace_hook.trust_selected"
  | "workspace_hook.review_timeout"
  | "workspace_hook.review_superseded"
  | "workspace_hook.snapshot_mismatch"
  | "workspace_hook.policy_blocked"
  | "workspace_hook.trust_store_failure"
  | "workspace_hook.toggle_failure"
  | "workspace_hook.config_rebuild_failure"
  | "workspace_hook.revoked"
  | "workspace_hook.stale_response";

export interface WorkspaceHookTelemetryFields {
  workspaceIdentity?: string;
  bundleDigest?: string;
  declarationDigest?: string;
  reasonCode?: WorkspaceHookReasonCode;
  source?: string;
  action?: string;
  generation?: number;
  /** 领域错误的短消息；禁止放命令正文、脚本内容或 workspace 路径。 */
  errorMessage?: string;
  requestItemCount?: number;
  requestEnabledCount?: number;
  grantedRecordCount?: number;
  revokedCount?: number;
}

/**
 * workspace 运行时准入的兼容声明（状态、分派决定、端口与选项）。运行时实现见
 * workspace-hook-runtime-admission.ts，该文件按原路径再导出这些名字。
 */
export type WorkspaceHookActivationSource = "startup" | "resume" | "clear" | "compact";

export interface WorkspaceHookDispatchInput {
  /** 持有 bundle 目标的调用方用它做一致性断言；运行时登记项不传。 */
  bundleDigest?: string;
  hookDeclarationDigest: string;
  reviewItemId: string;
}

export type WorkspaceHookDispatchDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: WorkspaceHookReasonCode; skipLifecycle?: boolean };

export interface WorkspaceHookAdmissionState {
  pendingCount: number;
  bundleDigest: string;
  workspaceIdentity?: string;
}

export type WorkspaceHookAdmissionStateCallback = (state: WorkspaceHookAdmissionState) => void;

export interface WorkspaceHookRuntimeAdmissionPort {
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void>;
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision;
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot;
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void;
  invalidate(reasonCode: WorkspaceHookReasonCode): void;
}

export interface WorkspaceHookRuntimeAdmissionOptions {
  coordinator: WorkspaceHookTrustCoordinator;
  enabled?: boolean;
  logger?: Logger;
  ready: Promise<void>;
  onAdmissionStateChanged?: WorkspaceHookAdmissionStateCallback;
  snapshot: WorkspaceHookBundleSnapshot;
}

/**
 * workspace 策略的兼容声明（变更通知与提供者端口）。实现见 workspace-hook-policy.ts，
 * 该文件按原路径再导出这两个名字。
 */
export interface WorkspaceHookPolicyChange {
  workspaceIdentity?: string;
  policy: WorkspaceHookPolicy;
}

export interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}
