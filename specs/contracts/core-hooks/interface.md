// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同版本 v1 的接口清单：只列兼容所需的模块路径、导出名、参数与返回类型。

# core-hooks 接口清单（v1）

## 一、模块路径

兼容需要的模块路径（调用方已按这些路径导入）：

| 模块路径                                                               | 兼容要求                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/cli/packages/core/src/hooks/index.ts`                            | **必须**保留：`@knorvia/core` 的 `src/index.ts` 以 `export * from "./hooks/index.js"` 引出；存量测试也按该路径导入       |
| `apps/cli/packages/core/src/hooks/workspace-hook-runtime-admission.ts` | **必须**保留：`core/src/runtime/{agent-runtime,internal,types}.ts` 按该路径导入 `WorkspaceHookRuntimeAdmissionPort` 类型 |
| 其余 24 个文件路径                                                     | 无外部导入方，属实现细节；重写时可自由拆分，但**必须**保留上表两个入口所导出的全部符号                                   |

其余文件（供实现者参考，不构成路径兼容要求）：
`configured-runner.ts`、`configured-runner-callback.ts`、`configured-runner-input.ts`、
`display-metadata.ts`、`output.ts`、`output-projection.ts`、`output-reduction.ts`、
`runner.ts`、`runner-callback.ts`、`runner-driver.ts`、`runner-helpers.ts`、
`runner-lifecycle.ts`、`runner-plan.ts`、`runner-program.ts`、`session-mailbox.ts`、
`types.ts`、`workspace-hook-policy.ts`、`workspace-hook-review-flow.ts`、
`workspace-hook-telemetry.ts`、`workspace-hook-trust-coordinator.ts`、
`workspace-hook-trust-domain.ts`、`workspace-hook-trust-evaluation.ts`、
`workspace-hook-trust-records.ts`、`workspace-hook-trust-types.ts`。

## 二、`hooks/index.ts` 导出（44 个）

### 函数

```ts
function createConfiguredHookRunner(options: ConfiguredHookRunnerOptions): HookRunner | undefined;
function createInMemoryHookRunner(options?: HookRunnerOptions): InMemoryHookRunner;
function createSessionMailboxHookRegistrations(options: {
  enqueuePendingInput?: (input: string, traceContext: TraceContext) => Promise<void>;
  mailbox: SessionMailboxPort;
  sessionId: SessionId;
}): HookRegistration[];
function createHookExecutionDescriptor(
  hook: HookConfig,
  timeoutMs: number,
  expandDisplayValue?: (value: string) => string,
): HookExecutionDescriptor;
function sanitizeHookDisplayText(value: string): string;
function createWorkspaceHookTrustRecords(input: {
  snapshot: WorkspaceHookBundleSnapshot;
  reviewItemIds: readonly string[];
  grantedAt: string;
  appVersion?: string;
}): WorkspaceHookTrustRecord[];
function createWorkspaceHookRuntimeAdmission(
  options: WorkspaceHookRuntimeAdmissionOptions,
): WorkspaceHookRuntimeAdmission;
function emitWorkspaceHookTelemetry(
  logger: Logger | undefined,
  event: WorkspaceHookTelemetryEvent,
  fields?: WorkspaceHookTelemetryFields,
): void;
function digestSummary(value: string): string;
function workspaceIdentitySummary(value: string): string;
```

### 类

```ts
class InMemoryHookRunner implements HookRunner {
  constructor(options?: HookRunnerOptions);
  register(hook: HookRegistration): void;
  run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult>;
}

class InMemoryWorkspaceHookPolicyProvider implements WorkspaceHookPolicyProvider {
  constructor(defaultPolicy?: WorkspaceHookPolicy);
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
  setWorkspacePolicy(workspaceIdentity: string, policy: WorkspaceHookPolicy): void;
  clearWorkspacePolicy(workspaceIdentity: string): void;
  setDefaultPolicy(policy: WorkspaceHookPolicy): void;
}

class WorkspaceHookTrustCoordinator {
  constructor(options: WorkspaceHookTrustCoordinatorOptions);
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  assertPersistentTrustMutationAllowed(workspaceIdentity: string): void;
  canMutatePersistentTrust(workspaceIdentity: string): boolean;
  replacePersistentTrustRecords(
    records: readonly WorkspaceHookTrustRecord[],
    state: WorkspaceHookTrustStoreState,
  ): void;
  revoke(input: {
    workspaceIdentity: string;
    hookDeclarationDigests: readonly string[];
  }): WorkspaceHookSecurityRevision;
  evaluateSnapshot(input: {
    snapshot: WorkspaceHookBundleSnapshot;
  }): WorkspaceHookSnapshotEvaluation;
  getSecurityRevision(workspaceIdentity: string): WorkspaceHookSecurityRevision;
  validateSecurityRevision(
    workspaceIdentity: string,
    revision: WorkspaceHookSecurityRevision,
  ): boolean;
}

class WorkspaceHookReviewFlowRegistry {
  open(value: WorkspaceHookReviewRequestPayload): WorkspaceHookReviewFlow;
  supersede(
    target: WorkspaceHookReviewTarget,
    replacement: WorkspaceHookReviewRequestPayload,
  ): WorkspaceHookReviewFlow;
  validate(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult;
  resolve(
    target: WorkspaceHookReviewTarget,
    decisionValue: WorkspaceHookReviewDecision,
  ): WorkspaceHookReviewResolveResult;
  fail(target: WorkspaceHookReviewTarget, reasonCode: WorkspaceHookReasonCode): boolean;
  closeWithoutDecision(target: WorkspaceHookReviewTarget): boolean;
  getCurrentFlow(sessionId: string): WorkspaceHookReviewFlow | undefined;
  getCurrent(sessionId: string): WorkspaceHookReviewFlowState | undefined;
}

class WorkspaceHookRuntimeAdmission implements WorkspaceHookRuntimeAdmissionPort {
  constructor(options: WorkspaceHookRuntimeAdmissionOptions);
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void>;
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision;
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot;
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void;
  invalidate(reasonCode: WorkspaceHookReasonCode): void;
}
```

### 类型与接口（导出名 + 关键形状）

```ts
type HookCallback = (
  input: HookInput,
  context: HookCallbackContext,
) =>
  | HookJSONOutput
  | HookCallbackResult
  | void
  | Promise<HookJSONOutput | HookCallbackResult | void>;

interface HookCallbackContext {
  hookIndex: number;
  signal?: AbortSignal;
}
interface HookCallbackDiagnostics {
  errorMessage?: string;
  stderrPreview?: string;
  stdoutPreview?: string;
}
interface HookCallbackResult {
  kind: "hookCallbackResult";
  diagnostics?: HookCallbackDiagnostics;
  output?: HookJSONOutput;
}
interface HookRegistration {
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
interface HookRunOptions {
  matchValue?: string;
  matchValues?: readonly string[];
  signal?: AbortSignal;
}
interface HookRunResult {
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
interface HookRunner {
  run(input: HookInput, options?: HookRunOptions): Promise<HookRunResult>;
}
interface HookRunnerOptions {
  defaultTimeoutMs?: number;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  hooks?: HookRegistration[];
  logger?: Logger;
}
interface ConfiguredHookRunnerOptions {
  config: HooksRuntimeConfig;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort: ExecutionPort;
  getWorkingDirectory: () => string;
  logger?: Logger;
  workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
  workspaceHookSnapshot?: WorkspaceHookBundleSnapshot;
}

interface WorkspaceHookPolicyChange {
  workspaceIdentity?: string;
  policy: WorkspaceHookPolicy;
}
interface WorkspaceHookPolicyProvider {
  getPolicy(workspaceIdentity: string): WorkspaceHookPolicy;
  subscribe(listener: (change: WorkspaceHookPolicyChange) => void): () => void;
}

type WorkspaceHookTrustStoreStatus = "missing" | "ok" | "corrupt";
interface WorkspaceHookTrustStoreState {
  status: WorkspaceHookTrustStoreStatus;
  recoveredCorruptPath?: string;
}
interface WorkspaceHookSnapshotEvaluation {
  workspaceIdentity: string;
  bundleDigest: string;
  policy: WorkspaceHookPolicy;
  securityRevision: WorkspaceHookSecurityRevision;
  storeStatus: WorkspaceHookTrustStoreStatus;
  reasonCode?: WorkspaceHookReasonCode;
  items: WorkspaceHookEffectiveState[];
}
interface WorkspaceHookTrustCoordinatorOptions {
  coordinatorEpoch: string;
  policyProvider?: WorkspaceHookPolicyProvider;
}

type WorkspaceHookActivationSource = "startup" | "resume" | "clear" | "compact";
interface WorkspaceHookDispatchInput {
  bundleDigest?: string;
  hookDeclarationDigest: string;
  reviewItemId: string;
}
type WorkspaceHookDispatchDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: WorkspaceHookReasonCode; skipLifecycle?: boolean };
interface WorkspaceHookAdmissionState {
  pendingCount: number;
  bundleDigest: string;
  workspaceIdentity?: string;
}
type WorkspaceHookAdmissionStateCallback = (state: WorkspaceHookAdmissionState) => void;
interface WorkspaceHookRuntimeAdmissionPort {
  activate(source: WorkspaceHookActivationSource, signal?: AbortSignal): Promise<void>;
  evaluateDispatch(input: WorkspaceHookDispatchInput): WorkspaceHookDispatchDecision;
  getCurrentSnapshot(): WorkspaceHookBundleSnapshot;
  replaceSnapshot(snapshot: WorkspaceHookBundleSnapshot): void;
  invalidate(reasonCode: WorkspaceHookReasonCode): void;
}
interface WorkspaceHookRuntimeAdmissionOptions {
  coordinator: WorkspaceHookTrustCoordinator;
  enabled?: boolean;
  logger?: Logger;
  ready: Promise<void>;
  onAdmissionStateChanged?: WorkspaceHookAdmissionStateCallback;
  snapshot: WorkspaceHookBundleSnapshot;
}

interface WorkspaceHookReviewTarget {
  sessionId: string;
  taskId: string;
  runId: string;
  remoteSessionId?: string;
  workspaceIdentity: string;
  bundleDigest: string;
  reviewFlowId: string;
  generation: number;
  interactionId: string;
}
interface WorkspaceHookReviewOutcome {
  action: WorkspaceHookReviewDecision["action"] | "no_change";
  reviewItemIds: string[];
  reasonCode: WorkspaceHookReasonCode | undefined;
}
type WorkspaceHookReviewResolveResult =
  | { accepted: true; reviewItemIds: string[] }
  | {
      accepted: false;
      reasonCode: "workspace_hooks_review_superseded" | "workspace_hooks_snapshot_mismatch";
    };
interface WorkspaceHookReviewFlow {
  readonly request: WorkspaceHookReviewRequestPayload;
  readonly result: Promise<WorkspaceHookReviewOutcome>;
  readonly state: WorkspaceHookReviewFlowState;
}

type WorkspaceHookTelemetryEvent =
  /* B24 列出的 12 个事件名 */
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
interface WorkspaceHookTelemetryFields {
  workspaceIdentity?: string;
  bundleDigest?: string;
  declarationDigest?: string;
  reasonCode?: WorkspaceHookReasonCode;
  source?: string;
  action?: string;
  generation?: number;
  errorMessage?: string;
  requestItemCount?: number;
  requestEnabledCount?: number;
  grantedRecordCount?: number;
  revokedCount?: number;
}
```

### 未在 `hooks/index.ts` 导出但被公开行为间接依赖的类型

`HookRunAdmissionDecision`、`HookOccurrence`、`HookReport`、`HookPlan`、`CallbackValue`、
`RunnerEnvironment`、`HookPorts`、`MUTABLE` 等属于实现细节，不构成兼容面。

## 三、跨包依赖（不得改变）

- `@knorvia/contracts`：`HookEventName`、`HookInput`、`HookJSONOutput`、`HookJSONOutputSchema`、
  `HookConfig`、`HookExecutionDescriptor`、`HookSourceKind`、`HooksRuntimeConfig`、
  `HookPermissionDecision`、`HookOutcome`、`HookRunLifecyclePayload`、`PermissionRequestHookDecision`、
  `ExecutionPort`、`ExecutionResult`、`SessionEvent`、`SessionEventType`、`CoreErrorType`、
  `createCoreError`、`isCoreError`、`traceContextToLogContext`、`WorkspaceHook*` 系列 schema 与常量、`Logger`。
- `@knorvia/shared/workspace-hook-discovery`：`resolveWorkspaceHookTimeoutMs`、
  `resolveWorkspaceHookMaxOutputBytes`。
- `@knorvia/shared/protocol-v4`：`workspaceHookReviewRequestPayloadSchema`、
  `workspaceHookReviewDecisionSchema` 及其类型。
- Node 内置：`node:crypto`（`createHash`、`crypto.randomUUID`）、`node:fs/promises`、`node:os`、`node:path`。

### 替换实现新增的导出类型（同样是兼容面）

```ts
interface WorkspaceHookEntryEvaluationInput {
  entry: CanonicalWorkspaceHookEntry;
  snapshot: WorkspaceHookBundleSnapshot;
  policy: WorkspaceHookPolicy;
  persistentRecords: ReadonlyMap<string, WorkspaceHookTrustRecord>;
  revokedKeys: ReadonlySet<string>;
  storeStatus: WorkspaceHookTrustStoreStatus;
}

interface SessionMailboxRegistrationOptions {
  enqueuePendingInput?: (input: string, traceContext: TraceContext) => Promise<void>;
  mailbox: SessionMailboxPort;
  sessionId: SessionId;
}
```
