# core-tool-01 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

覆盖范围：`apps/cli/packages/core/src/tool`（直接子文件）与 `apps/cli/packages/core/src/tool/executor/` 下的 **32 个继承文件**（共 3914 行）。这些文件的导出是兼容面；同目录下已登记 `independent-replacement` 的文件不在本包重写范围，但它们的导出经由下面的入口继续对外可见。

## 入口与导出图

```text
apps/cli/packages/core/src/tool/index.ts            ← 包入口（barrel）
  ├─ ./scheduler.js        （已独立替换，不在本包）
  ├─ ./types.js            ★ 本包
  ├─ ./registry.js         （已独立替换，不在本包）
  ├─ ./executor.js         ★ 本包 → ./executor/impl.js / ./executor/types.js
  └─ ./handlers/index.js   （core-tool-handlers-* 范围，不在本包）
```

★ = 本包重写的继承文件提供的入口。

## 逐文件导出

### `apps/cli/packages/core/src/tool/bash-timeout-policy.ts`

继承分类 `upstream-unchanged`，43 行。导出 6 个声明、0 条 re-export。

```ts
export interface BashTimeoutPolicy {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
}
export const DEFAULT_BASH_TIMEOUT_MS = 120_000;
export const DEFAULT_BASH_MAX_TIMEOUT_MS = 600_000;
export const DEFAULT_BASH_TIMEOUT_POLICY: BashTimeoutPolicy;
export function resolveBashTimeoutPolicy(
  env: Readonly<Record<string, string | undefined>>,
): BashTimeoutPolicy;
export function resolveBashTimeoutMs(
  inputTimeoutMs: number | undefined,
  policy: BashTimeoutPolicy,
): number;
```

### `apps/cli/packages/core/src/tool/compat.ts`

继承分类 `upstream-unchanged`，24 行。导出 3 个声明、0 条 re-export。

```ts
export const TASK_TOOL_NAME = "Task";
export function isSubagentDispatchToolName(toolName: string | undefined): boolean;
export function hookMatcherToolNamesForTool(toolName: string): readonly string[];
```

### `apps/cli/packages/core/src/tool/diff.ts`

继承分类 `upstream-modified`，39 行。导出 2 个声明、0 条 re-export。

```ts
export const createStructuredPatch: ({
  filePath,
  newContent,
  oldContent,
}: {
  filePath: string;
  newContent: string;
  oldContent: string;
}) => DiffHunk[];
export const countPatchLines: (structuredPatch: DiffHunk[]) => {
  additions: number;
  deletions: number;
};
```

### `apps/cli/packages/core/src/tool/edit-match-distance.ts`

继承分类 `unreviewed`，41 行。导出 1 个声明、0 条 re-export。

```ts
export function editLineDistance(left: string, right: string): number;
```

### `apps/cli/packages/core/src/tool/edit-match-text.ts`

继承分类 `unreviewed`，88 行。导出 5 个声明、0 条 re-export。

```ts
export const plainQuotes: (text: string) => string;
export function stripReadNumbers(text: string): string | undefined;
export function visibleCharacters(text: string): string;
export function unicodeCharacters(text: string): string;
export function restoreQuotes(actual: string, replacement: string): string;
```

### `apps/cli/packages/core/src/tool/edit-matchers.ts`

继承分类 `upstream-modified`，183 行。导出 4 个声明、0 条 re-export。

```ts
export function findEditMatch(input: {
  content: string;
  search: string;
  replaceAll: boolean;
}): EditMatchResult;
export function normalizeLineEndings(content: string): string;
export function normalizeReplacementForMatch(
  strategy: EditMatchStrategy,
  newString: string,
): string;
export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string;
```

### `apps/cli/packages/core/src/tool/executor.ts`

继承分类 `upstream-unchanged`，3 行。导出 0 个声明、2 条 re-export。

re-export：

```ts
export { ToolExecutorImpl, createToolExecutor } from "./executor/impl.js";
export type { ToolExecutor, ToolExecutorOptions } from "./executor/types.js";
```

### `apps/cli/packages/core/src/tool/executor/background-task-output.ts`

继承分类 `upstream-modified`，97 行。导出 1 个声明、0 条 re-export。

```ts
export function backgroundTaskOutputMetadata(
  snapshot: object | undefined,
  launchOutput?: Record<string, unknown>,
): BackgroundTaskOutputMetadata;
```

### `apps/cli/packages/core/src/tool/executor/background-task-registry.ts`

继承分类 `upstream-modified`，290 行。导出 6 个声明、0 条 re-export。

```ts
export function isDynamicWorkflowRunDispatchToolName(name: string): boolean;
export function registerRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  output: Record<string, unknown>,
  turnId?: RuntimeTaskSnapshot["turnId"],
): void;
export function updateRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: BackgroundTaskSnapshot,
): void;
export function claimRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): boolean;
export function releaseRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void;
export function removeRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void;
```

### `apps/cli/packages/core/src/tool/executor/background-tasks.ts`

继承分类 `upstream-modified`，307 行。导出 1 个声明、0 条 re-export。

```ts
export class BackgroundTaskTracker {
  private readonly trackedTaskIds = new Set<string>();

  constructor(private readonly deps: ToolExecutorDeps) ;

  async trackBackgroundTask(
    toolCall: ExecutableToolCall,
    output: unknown,
    traceContext: TraceContext,
    turnId: TurnId | undefined,
  ): Promise<void> ;
}
```

### `apps/cli/packages/core/src/tool/executor/background-tracker-notification.ts`

继承分类 `unreviewed`，401 行。导出 1 个声明、0 条 re-export。

```ts
export function enqueueTerminalNotification(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  traceContext: TraceContext,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): void;
```

### `apps/cli/packages/core/src/tool/executor/background-tracker-projection.ts`

继承分类 `unreviewed`，209 行。导出 13 个声明、0 条 re-export。

```ts
export type TaskSnapshot =
  | BackgroundExecutionSnapshot
  | SubagentTaskSnapshot
  | WorkflowTaskSnapshot
  | DynamicWorkflowRunSnapshot;
export function hasSnapshotProvider(deps: ToolExecutorDeps, name: string): boolean;
export function hasDirectWaiter(deps: ToolExecutorDeps, name: string): boolean;
export async function readTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined>;
export async function waitForTaskSnapshot(
  deps: ToolExecutorDeps,
  name: string,
  taskId: string,
): Promise<TaskSnapshot | undefined>;
export function field(snapshot: object | undefined, key: string): unknown;
export function stringField(value: object | undefined, key: string): string | undefined;
export function snapshotString(snapshot: object | undefined, key: string): string | undefined;
export function workflowSubject(
  call: ExecutableToolCall,
  taskId: string,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): string;
export function errorMessage(error: unknown): string;
export function runningSignature(snapshot: TaskSnapshot): string;
export function taskPayload(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  launch: Record<string, unknown>,
  snapshot?: TaskSnapshot,
);
export async function emitBackgroundTaskEvent(
  deps: ToolExecutorDeps,
  type: SessionEvent["type"],
  payload: Record<string, unknown>,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
): Promise<void>;
```

### `apps/cli/packages/core/src/tool/executor/events.ts`

继承分类 `upstream-modified`，219 行。导出 7 个声明、0 条 re-export。

```ts
export async function emitToolCallStarted(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  startTime: number,
  display?: ToolResultDisplayPayload,
  // 解析后的副作用能力（与权限判定同源）：订阅者据此在工具动手前知道「要写了」。
  capability?: { readOnly?: boolean; sideEffectScope?: ToolSideEffectScope },
): Promise<void>;
export async function emitToolCallResult(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  serialization: ToolResultSerialization,
  durationMs: number,
  display: ToolResultDisplayPayload | undefined,
  perf: ToolExecutionTelemetry | undefined,
  skillMetadata: SkillTelemetryMetadata | undefined,
): Promise<void>;
export async function emitToolCallError(
  deps: ToolExecutorDeps,
  toolCallId: string,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  error: ToolExecutionResult["error"],
  skillMetadata?: SkillTelemetryMetadata,
): Promise<void>;
export async function emitSkippedToolError(
  deps: ToolExecutorDeps,
  result: ToolExecutionResult,
  traceContext?: TraceContext,
): Promise<void>;
export async function emitPermissionRequested(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  requestId: string,
  riskLevel: PermissionContext["riskLevel"],
  reason: string | undefined,
  suggestedPermissionUpdates: PermissionUpdate[],
  traceContext: TraceContext,
  approval?: { display?: ToolResultDisplayPayload; optionsPolicy?: PermissionOptionsPolicy },
): Promise<void>;
export async function emitPermissionResolved(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  requestId: string,
  decision: PermissionBrokerResult,
  traceContext: TraceContext,
): Promise<void>;
export async function emitPermissionDenied(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  reason: string | undefined,
  traceContext: TraceContext,
): Promise<void>;
```

### `apps/cli/packages/core/src/tool/executor/impl.ts`

继承分类 `upstream-modified`，138 行。导出 2 个声明、0 条 re-export。

```ts
export class ToolExecutorImpl implements ToolExecutor {
  private readonly deps: ToolExecutorDeps;
  private readonly backgroundTasks: BackgroundTaskTracker;

  constructor(options: ToolExecutorOptions);

  execute(toolCall: ExecutableToolCall, options?: ToolExecuteOptions): Promise<ToolExecutionResult>;

  trackExternalBackgroundTask(
    toolCall: ExecutableToolCall,
    output: Record<string, unknown>,
    traceContext: TraceContext,
    turnId?: TurnId,
  ): Promise<void>;

  executeBatch(
    toolCalls: ExecutableToolCall[],
    options?: ToolBatchExecuteOptions,
  ): Promise<ToolExecutionResult[]>;

  async *executeSchedule(
    toolCalls: ExecutableToolCall[],
    schedule: ToolSchedule,
    options?: ToolBatchExecuteOptions,
  ): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void>;
}
export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor;
```

### `apps/cli/packages/core/src/tool/executor/memory-file-permission.ts`

继承分类 `upstream-modified`，85 行。导出 2 个声明、0 条 re-export。

```ts
export function applyMemoryFilePermission(
  input: MemoryFilePermissionInput,
): PermissionDecisionResult;
export function targetsMemoryFile(input: MemoryFileTargetInput): boolean;
```

### `apps/cli/packages/core/src/tool/executor/model-status-sink.ts`

继承分类 `upstream-modified`，52 行。导出 2 个声明、0 条 re-export。

```ts
export function createToolModelStatusSink(
  context: Pick<ToolExecutionContext, "emitEvent" | "sessionId" | "turnId" | "traceId">,
): ModelStatusSink | undefined;
export function withDefaultToolModelStatusSink(
  model: Model | undefined,
  sink: ModelStatusSink | undefined,
): Model | undefined;
```

### `apps/cli/packages/core/src/tool/executor/telemetry.ts`

继承分类 `upstream-modified`，31 行。导出 1 个声明、0 条 re-export。

```ts
export async function runToolCallWithTelemetry(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  options: ToolExecuteOptions | undefined,
  execute: (telemetry: ToolExecutionSpanWriter | undefined) => Promise<ToolExecutionResult>,
): Promise<ToolExecutionResult>;
```

### `apps/cli/packages/core/src/tool/executor/turn-control.ts`

继承分类 `upstream-modified`，91 行。导出 4 个声明、0 条 re-export。

```ts
export function withAutomationCreateLimitTurnStop(
  result: ToolExecutionResult,
  input: { error: unknown; toolName: string },
): ToolExecutionResult;
export function withPlanExitDeniedTurnStop(
  result: ToolExecutionResult,
  input: { mode: CollaborationMode; planEnabled?: boolean; toolName: string },
): ToolExecutionResult;
export function withWorkflowRefineDeniedFollowUp(
  result: ToolExecutionResult,
  input: { toolName: string },
): ToolExecutionResult;
export function withTerminalToolTurnStop(
  result: ToolExecutionResult,
  input: { entry: ToolEntry },
): ToolExecutionResult;
```

### `apps/cli/packages/core/src/tool/executor/types.ts`

继承分类 `upstream-modified`，240 行。导出 9 个声明、0 条 re-export。

```ts
export interface BackgroundTaskNotificationCommand {
  originMeta?: BackgroundResultOriginMeta;
  taskId?: string;
  text: string;
  toolName?: string;
  traceContext: TraceContext;
}
export type EnqueueBackgroundTaskNotification = (
  notification: BackgroundTaskNotificationCommand,
) => undefined;
export interface BackgroundTaskNotificationPolicyInput {
  runtimeScope: ToolRuntimeScope;
  status: string;
  taskId: string;
  toolName: string;
  traceContext: TraceContext;
}
export type ShouldEnqueueBackgroundTaskNotification = (
  input: BackgroundTaskNotificationPolicyInput,
) => boolean;
export interface ToolExecutorOptions {
  agentTelemetry?: AgentExecutionTelemetryPort;
  agentTelemetryActorKind?: AgentTelemetryActorKind;
  registry: ToolRegistry;
  permissionService: PermissionService;
  permissionBroker?: PermissionBrokerPort;
  emitEvent: (event: SessionEvent) => Promise<void>;
  enqueueBackgroundTaskNotification?: EnqueueBackgroundTaskNotification;
  shouldEnqueueBackgroundTaskNotification?: ShouldEnqueueBackgroundTaskNotification;
  sessionId: SessionId;
  turnId?: TurnId;
  defaultTimeoutMs?: number;
  permissionTimeoutMs?: number;
  logger?: Logger;
  backgroundTaskControlPort?: BackgroundTaskControlPort;
  executionPort?: ExecutionPort;
  browserControlPort?: BrowserControlPort;
  browserDocumentationRoot?: string;
  fileSystemPort?: FileSystemPort;
  httpClientPort?: HttpClientPort;
  imageProcessorPort?: ImageProcessorPort;
  pdfDocumentPort?: PdfDocumentPort;
  model?: Model;
  embeddedSearchBackend?: EmbeddedSearchBackend;
  nativeSearchEnhancementsEnabled?: boolean;
  skillPort?: SkillPort;
  subagentPort?: SubagentPort;
  coordinatorResponsePort?: CoordinatorResponsePort;
  workflowSubmitPort?: WorkflowSubmitPort;
  /** actor 的升级端口；存在即为该会话注册 escalate。 */
  workflowEscalatePort?: WorkflowEscalatePort;
  artifactStore?: ToolArtifactStorePort;
  automationPort?: AutomationPort;
  offPeakPort?: OffPeakPort;
  sessionStore?: SessionStorePort;
  sessionModePort?: SessionModePort;
  workflowPort?: WorkflowPort;
  /** workflow run 端口；按工具名查表时 CreateWorkflow 的后台生命周期提供者。 */
  dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
  dynamicWorkflowSnippetPort?: DynamicWorkflowSnippetPort;
  /** 模型目录端口；缺席则 ListModels 报能力缺席，CreateWorkflow 的 subagent_model 被拒。 */
  modelCatalogPort?: ModelCatalogPort;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  readFileState?: ReadFileStateMap;
  subagentBackgroundBashMaxMs?: number;
  bashShellSelection?: ExecutionShellSelection;
  getBashShellSelection?: () => ExecutionShellSelection | undefined;
  workingDirectory?: string;
  workspaceRoot?: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  clientMode?: "desktop-continuous" | "web-remote-replayable";
  deliveryKind?: "desktop-continuous" | "web-remote-replayable";
  runtimeScope?: ToolRuntimeScope;
  getWorkingDirectory?: () => string;
  setWorkingDirectory?: (cwd: string) => Promise<void> | void;
  getWorkspaceRoot?: () => string;
  getMemoryRoot?: () => string | undefined;
  traceContext?: TraceContext;
  mode?: CollaborationMode;
  getMode?: () => CollaborationMode;
  maxConcurrency?: number;
  hookRunner?: HookRunner;
}
export interface ToolExecutor {
  execute(toolCall: ExecutableToolCall, options?: ToolExecuteOptions): Promise<ToolExecutionResult>;
  executeBatch(
    toolCalls: ExecutableToolCall[],
    options?: ToolBatchExecuteOptions,
  ): Promise<ToolExecutionResult[]>;
  executeSchedule(
    toolCalls: ExecutableToolCall[],
    schedule: ToolSchedule,
    options?: ToolBatchExecuteOptions,
  ): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void>;
  /**
   * 把一个**不由本回合工具调用启动**的后台任务纳入追踪（dwf run 的 resume 重臂）。`toolCall` 是调用方合成的描述子（id = 原始
   * toolCallId、name 决定 per-tool 生命周期分派）——tracker 只读它的 id/name/input，
   * 不要求一个真实在飞的工具调用。效果与 submit 路径完全同源：runtime-task registry 登记
   * （会话回收护栏）、BackgroundTaskStarted（backgroundWorks 面板 + cancellable）、
   * 轮询/终态 waiter、结算通知。同 taskId 重复调用由 tracker 的 poller 去重（幂等）。
   */
  trackExternalBackgroundTask(
    toolCall: ExecutableToolCall,
    output: Record<string, unknown>,
    traceContext: TraceContext,
    turnId?: TurnId,
  ): Promise<void>;
}
export interface ToolExecuteOptions {
  automationTurn?: boolean;
  offPeakTurn?: boolean;
  signal?: AbortSignal;
  traceContext?: TraceContext;
  subagentModelOverride?: SubagentRunOptions["modelOverride"];
  model?: Model;
}
export interface ToolBatchExecuteOptions extends ToolExecuteOptions {
  maxConcurrency?: number;
}
export interface ToolExecutorDeps {
  agentTelemetry?: AgentExecutionTelemetryPort;
  agentTelemetryActorKind?: AgentTelemetryActorKind;
  registry: ToolRegistry;
  permissionService: PermissionService;
  permissionBroker: PermissionBrokerPort;
  emitEvent: (event: SessionEvent) => Promise<void>;
  enqueueBackgroundTaskNotification?: EnqueueBackgroundTaskNotification;
  shouldEnqueueBackgroundTaskNotification?: ShouldEnqueueBackgroundTaskNotification;
  sessionId: SessionId;
  turnId?: TurnId;
  defaultTimeoutMs: number;
  permissionTimeoutMs?: number;
  logger?: Logger;
  backgroundTaskControlPort?: BackgroundTaskControlPort;
  executionPort?: ExecutionPort;
  browserControlPort?: BrowserControlPort;
  browserDocumentationRoot?: string;
  fileSystemPort?: FileSystemPort;
  httpClientPort?: HttpClientPort;
  imageProcessorPort?: ImageProcessorPort;
  pdfDocumentPort?: PdfDocumentPort;
  model?: Model;
  embeddedSearchBackend?: EmbeddedSearchBackend;
  nativeSearchEnhancementsEnabled?: boolean;
  skillPort?: SkillPort;
  subagentPort?: SubagentPort;
  coordinatorResponsePort?: CoordinatorResponsePort;
  workflowSubmitPort?: WorkflowSubmitPort;
  /** actor 的升级端口；存在即为该会话注册 escalate。 */
  workflowEscalatePort?: WorkflowEscalatePort;
  artifactStore?: ToolArtifactStorePort;
  automationPort?: AutomationPort;
  offPeakPort?: OffPeakPort;
  sessionStore?: SessionStorePort;
  sessionModePort?: SessionModePort;
  workflowPort?: WorkflowPort;
  /** workflow run 端口；按工具名查表时 CreateWorkflow 的后台生命周期提供者。 */
  dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
  dynamicWorkflowSnippetPort?: DynamicWorkflowSnippetPort;
  /** 模型目录端口；缺席则 ListModels 报能力缺席，CreateWorkflow 的 subagent_model 被拒。 */
  modelCatalogPort?: ModelCatalogPort;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  readFileState: ReadFileStateMap;
  subagentBackgroundBashMaxMs?: number;
  bashShellSelection?: ExecutionShellSelection;
  getBashShellSelection?: () => ExecutionShellSelection | undefined;
  getWorkingDirectory: () => string;
  setWorkingDirectory?: (cwd: string) => Promise<void> | void;
  getWorkspaceRoot: () => string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  clientMode?: "desktop-continuous" | "web-remote-replayable";
  deliveryKind?: "desktop-continuous" | "web-remote-replayable";
  getMemoryRoot?: () => string | undefined;
  runtimeScope: ToolRuntimeScope;
  traceContext?: TraceContext;
  getMode: () => CollaborationMode;
  maxConcurrency: number;
  hookRunner?: HookRunner;
}
```

### `apps/cli/packages/core/src/tool/executor/utils.ts`

继承分类 `upstream-unchanged`，27 行。导出 3 个声明、0 条 re-export。

```ts
export function isRecord(value: unknown): value is Record<string, unknown>;
export function summarizeInput(input: unknown): Record<string, unknown>;
export function previewHookValue(value: unknown): string;
```

### `apps/cli/packages/core/src/tool/executor/workflow-artifact.ts`

继承分类 `upstream-modified`，42 行。导出 2 个声明、1 条 re-export。

re-export：

```ts
export { serializeWorkflowArtifact };
```

```ts
export function buildWorkflowReportsNotificationSection(
  items: readonly unknown[] | undefined,
): WorkflowReportsNotificationSection | undefined;
export function buildWorkflowReportsManifestSection(
  items: readonly unknown[] | undefined,
): { count: number; shown: number; preview: string[] } | undefined;
```

### `apps/cli/packages/core/src/tool/executor/workflow-published-artifacts.ts`

继承分类 `upstream-unchanged`，235 行。导出 6 个声明、0 条 re-export。

```ts
export const WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES = 8;
export const WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES = 32;
export function formatPublishedArtifactLine(artifact: PublishedArtifactSummary): string;
export function buildWorkflowArtifactsNotificationSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
  maxLines: number,
): WorkflowArtifactsNotificationSection | undefined;
export function buildWorkflowArtifactsManifestSection(
  artifacts: readonly PublishedArtifactSummary[] | undefined,
): { artifacts: WorkflowArtifactManifestEntry[]; artifactsTruncated?: true } | undefined;
export function toPublishedArtifactSummaries(
  value: unknown,
): PublishedArtifactSummary[] | undefined;
```

### `apps/cli/packages/core/src/tool/index.ts`

继承分类 `upstream-unchanged`，10 行。导出 0 个声明、5 条 re-export。

re-export：

```ts
export * from "./scheduler.js";
export * from "./types.js";
export * from "./registry.js";
export * from "./executor.js";
export { builtInTools, registerBuiltInTools } from "./handlers/index.js";
```

### `apps/cli/packages/core/src/tool/model-contract.ts`

继承分类 `upstream-modified`，34 行。导出 2 个声明、0 条 re-export。

```ts
export function resolveToolEntryModelContract(
  entry: ToolEntry,
  context: ToolExecutionModelContext,
): ToolEntry;
export function projectToolModelContract(
  contract: ModelToolContract,
  entry: ToolEntry | undefined,
  context: ToolExecutionModelContext,
): ModelToolContract;
```

### `apps/cli/packages/core/src/tool/path-normalization.ts`

继承分类 `upstream-unchanged`，53 行。导出 4 个声明、0 条 re-export。

```ts
export type ToolPathPlatform = NodeJS.Platform;
export type ToolPathApi = typeof path.posix | typeof path.win32;
export function getToolPathApi(platform: ToolPathPlatform): ToolPathApi;
export function normalizeToolPathForComparison(
  filePath: string,
  platform: ToolPathPlatform = currentPlatform,
): string;
```

### `apps/cli/packages/core/src/tool/path-policy.ts`

继承分类 `upstream-modified`，74 行。导出 2 个声明、0 条 re-export。

```ts
export function resolveWorkspacePath(options: ToolWorkspacePathOptions): string;
export function resolveToolWorkingDirectory(
  inputCwd: string | undefined,
  options: Omit<ToolWorkspacePathOptions, "inputPath">,
): string;
```

### `apps/cli/packages/core/src/tool/provider-visible-order.ts`

继承分类 `upstream-unchanged`，53 行。导出 1 个声明、0 条 re-export。

```ts
export function orderProviderVisibleToolContracts<T extends { name: string }>(
  tools: readonly T[],
): T[];
```

### `apps/cli/packages/core/src/tool/read-file-state-metadata.ts`

继承分类 `upstream-modified`，118 行。导出 6 个声明、0 条 re-export。

```ts
export const READ_FILE_STATE_METADATA_SCHEMA_VERSION = 1;
export type PersistedReadFileStateTool = "Read" | "Write" | "Edit";
export interface PersistedReadFileStateMetadata {
  schemaVersion: typeof READ_FILE_STATE_METADATA_SCHEMA_VERSION;
  tool: PersistedReadFileStateTool;
  path: string;
  content: string;
  offset?: number;
  limit?: number;
  isPartialView: boolean;
  readAtMs: number;
  revisionId: string;
  mtimeMs: number;
  sizeBytes: number;
}
export function parseReadFileStateMetadata(
  metadata: unknown,
): PersistedReadFileStateMetadata | undefined;
export function createReadFileStateMetadataFromEntry(input: {
  completedAt: Date;
  entry?: ReadFileStateEntry;
  toolName: PersistedReadFileStateTool;
}): PersistedReadFileStateMetadata | undefined;
export function createReadFileStateMetadata(input: {
  completedAt: Date;
  output: unknown;
  readFileState?: ReadFileStateMap;
  toolInput: unknown;
  toolName: string;
}): PersistedReadFileStateMetadata | undefined;
```

### `apps/cli/packages/core/src/tool/read-file-state.ts`

继承分类 `upstream-modified`，47 行。导出 4 个声明、0 条 re-export。

```ts
export function createReadFileStateKey(
  filePath: string,
  offset: number | undefined,
  limit: number | undefined,
  target: NodeJS.Platform = platform,
): string;
export function normalizeReadFileStateMtimeMs(value: number | undefined): number | undefined;
export function findLatestReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined;
export function findEditableReadFileState(
  states: ReadFileStateMap | undefined,
  filePath: string,
  target: NodeJS.Platform = platform,
): ReadFileStateEntry | undefined;
```

### `apps/cli/packages/core/src/tool/tool-visibility.ts`

继承分类 `upstream-unchanged`，40 行。导出 4 个声明、0 条 re-export。

```ts
export function normalizeToolNameAlias(toolName: string): string;
export function createToolRuleNameSet(
  rules: readonly string[] | undefined,
): ReadonlySet<string> | undefined;
export function isToolNameDisallowed(
  toolName: string,
  disallowedTools: readonly string[] | undefined,
): boolean;
export function filterDisallowedToolNames(
  toolNames: readonly string[],
  disallowedTools: readonly string[] | undefined,
): readonly string[];
```

### `apps/cli/packages/core/src/tool/types.ts`

继承分类 `upstream-modified`，484 行。导出 29 个声明、0 条 re-export。

```ts
export interface ToolMetadata {
  name: string;
  description?: string;
  modelInstructions?: readonly string[];
  allowedInPlanMode?: boolean;
  readOnly: boolean;
  destructive: boolean;
  concurrentSafe: boolean;
  requiresUserInteraction?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  sideEffectScope: ModelToolSideEffectScope;
  riskLevel: RiskLevel;
  needsApproval: boolean;
  providerVisible?: boolean;
  /**
   * 声明该工具是“成功即终止 turn”的终态工具：一旦返回成功结果，executor 就在该结果上挂
   * turnControl 终止当前 turn。这是工具的内在能力声明（像 concurrentSafe/destructive），
   * 由 executor 读取，而不是在调用点按工具名猜测。submit_result 用它实现 actor 的终态提交。
   */
  stopTurnOnSuccess?: boolean;
  /** MCP discovery 的可信展示来源；只参与 UI 投影，不参与权限判定。 */
  mcpPresentation?: {
    serverName: string;
    toolName: string;
    description?: string;
    /** 来自声明 knorvia_official 鉴权的 MCP server；仅用于信任其结果里的结构化标识。 */
    official?: boolean;
  };
}
export type ToolRuntimeScope = "main" | "subagent";
export interface BackgroundTaskControlStopOptions {
  /** 谁在停：TaskStop 填 "model"，终态通知据此措辞。 */
  initiator?: "user" | "model";
  strict: true;
  traceContext?: TraceContext;
}
export interface BackgroundTaskControlStopResult {
  command?: string;
  ok: boolean;
  reason?:
    | "background_task_cancel_not_supported"
    | "background_task_not_found"
    | "background_task_not_running";
  status?: string;
  taskId: string;
  type?: string;
}
export interface BackgroundTaskControlPort {
  stopBackgroundTask(
    taskId: string,
    options: BackgroundTaskControlStopOptions,
  ): Promise<BackgroundTaskControlStopResult>;
}
export interface ToolExecutionContext {
  toolCallId: string;
  /**
   * 当前 Tool 的实时观测写入器。Handler 只能通过窄接口写事实，不能接触原始 OTel Span。
   */
  telemetry?: ToolExecutionSpanWriter;
  /** 当前工具调用是否属于 automation 派发轮；写工具 handler 用它做最终权限校验。 */
  automationTurn?: boolean;
  /** 当前工具调用是否属于闲时任务派发轮；OffPeakCreate handler 用它做最终拒绝。 */
  offPeakTurn?: boolean;
  traceContext?: TraceContext;
  traceId: TraceId;
  spanId?: string;
  parentSpanId?: string;
  abortSignal: AbortSignal;
  backgroundTaskControlPort?: BackgroundTaskControlPort;
  emitEvent?: (event: SessionEvent) => Promise<void>;
  executionPort?: ExecutionPort;
  /** browser-use 控制端口；node_repl 的 agent.browsers.* 经此执行。缺省则 browser 不可用。 */
  browserControlPort?: BrowserControlPort;
  /** 官方 browser-use plugin docs 资产目录；只在 browser-use 启用时用于 agent.browsers.documentation()。 */
  browserDocumentationRoot?: string;
  fileSystemPort?: FileSystemPort;
  httpClientPort?: HttpClientPort;
  imageProcessorPort?: ImageProcessorPort;
  pdfDocumentPort?: PdfDocumentPort;
  model?: Model;
  /** Core Server 对前台 child 的 Selection override。 */
  subagentModelOverride?: SubagentRunOptions["modelOverride"];
  skillPort?: SkillPort;
  subagentPort?: SubagentPort;
  coordinatorResponsePort?: CoordinatorResponsePort;
  /** 工作流 actor 提交终态结果并等待引擎裁决的端口；仅在 workflow actor 会话注入。 */
  workflowSubmitPort?: WorkflowSubmitPort;
  /** 工作流 actor 升级阻塞问题并等待主代理作答的端口；仅在 workflow actor 会话注入。 */
  workflowEscalatePort?: WorkflowEscalatePort;
  artifactStore?: ToolArtifactStorePort;
  automationPort?: AutomationPort;
  offPeakPort?: OffPeakPort;
  sessionStore?: SessionStorePort;
  sessionModePort?: SessionModePort;
  workflowPort?: WorkflowPort;
  /** workflow run 提交端口；缺席则 CreateWorkflow 回占位诊断而不启动。 */
  dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
  /** dwf snippet 同步执行端口；缺席则 EvalWorkflowSnippet 报能力缺席的业务失败。 */
  dynamicWorkflowSnippetPort?: DynamicWorkflowSnippetPort;
  /** 模型目录端口；缺席则 ListModels 报能力缺席，CreateWorkflow 的 subagent_model 被拒。 */
  modelCatalogPort?: ModelCatalogPort;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  readFileState?: ReadFileStateMap;
  recordReadFileStateMetadata?: (metadata: PersistedReadFileStateMetadata) => void;
  /** 记录 Skill resolved metadata；仅用于 telemetry，不改变模型可见结果。 */
  recordSkillTelemetryMetadata?: (metadata: SkillTelemetryMetadata) => void;
  bashShellSelection?: ExecutionShellSelection;
  embeddedSearch?: ToolEmbeddedSearchContext;
  setWorkingDirectory?: (cwd: string) => Promise<void> | void;
  workingDirectory: string;
  workspaceRoot: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  clientMode?: "desktop-continuous" | "web-remote-replayable";
  deliveryKind?: "desktop-continuous" | "web-remote-replayable";
  memoryRoot?: string;
  runtimeScope?: ToolRuntimeScope;
  providerVisibleToolNames?: readonly string[];
  sessionId: SessionId;
  turnId?: TurnId;
}
export interface ToolEmbeddedSearchContext {
  backend?: EmbeddedSearchBackend;
  enabled: boolean;
  findAndGrepEnabled?: boolean;
}
export interface ReadFileStateEntry {
  path: string;
  content: string;
  offset?: number;
  limit?: number;
  isPartialView: boolean;
  readAt: Date;
  sourceTool?: "Read" | "Write" | "Edit";
  revisionId?: string;
  mtimeMs?: number;
  sizeBytes?: number;
}
export type ReadFileStateMap = Map<string, ReadFileStateEntry>;
export interface ToolHandlerFailure {
  result: false;
  errorCode: number;
  message: string;
}
export interface ToolInputValidationContext {
  runtimeTaskRegistry?: RuntimeTaskRegistry;
}
export type ToolInputValidationResult = { result: true } | ToolHandlerFailure;
export interface ToolInputResolutionContext {
  workingDirectory?: string;
  runtimeTaskRegistry?: RuntimeTaskRegistry;
  /**
   * workflow run 端口与本会话 id：AmendWorkflow 用它们把 `run_id` 解析成「前驱是不是本会话的、
   * 还在不在跑」的事实块。仍然只读——
   * 归一化钩子不因此变成第二个执行入口。
   */
  dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
  /**
   * 模型目录端口：CreateWorkflow / AmendWorkflow 用它把 `subagent_model` 解析成规范形，解不出来
   * 在确认窗**之前**就作为业务失败退回。
   * 同步、只读，与 `dynamicWorkflowRunPort` 同一条理由待在这里。缺席时给了字段即被拒——
   * 不静默放行一个宿主解不了的字符串。
   */
  modelCatalogPort?: ModelCatalogPort;
  sessionId?: string;
}
export type ToolInputResolutionResult = { result: true; input: unknown } | ToolHandlerFailure;
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<TOutput>;
export interface ToolEntry extends ToolContractDeclaration {
  /** 仅宿主注册时写入：明确要求用户应答的接管操作，不能由自动 hook 或持久规则授予。 */
  approvalAuthority?: "user";
  aliases?: readonly string[];
  /**
   * Host-issued atomicity policy for model content. Only an authority-verified
   * registration path may set this; executor code must never infer it from a
   * tool name or from model-visible content.
   */
  modelContentProtection?: ModelContentProtection["kind"];
  /**
   * Optional provider-visible character threshold for tools whose upstream contract
   * budgets UTF-16 characters rather than UTF-8 bytes.
   */
  maxModelChars?: number;
  /**
   * MIME type for provider-visible model content persisted by the result budget.
   * Defaults to the handler result shape when omitted.
   */
  resultArtifactContentType?: string;
  metadata: ToolMetadata;
  /**
   * 只由宿主验证后的可信来源写入；不能从模型可见的 MCP 名称或 descriptor 推导。
   */
  permissionCapabilityGroup?: PermissionCapabilityGroup;
  executionMode?: ToolExecutionMode;
  providerNative?: ProviderNativeToolSpec;
  handler: ToolHandler;
  /** 当前 turn 模型能力对 provider descriptor 与 executor schema 的同源投影。 */
  resolveModelContract?: (context: ToolExecutionModelContext) => {
    description?: string;
    inputSchema?: JsonSchema;
  };
  validateInput?: (
    input: unknown,
    context: ToolInputValidationContext,
  ) => ToolInputValidationResult;
  /**
   * 把模型发出的入参**归一化成将要发生的执行事实**。executor 在 `validateInput` 之后、
   * PreToolUse hook 之前调用，返回值直接替换 `executionInput`。
   *
   * 位置就是全部的意义。此后 hook、项目权限规则、权限事件载荷、`prepareApproval`、handler
   * 读到的都是同一份归一化输入，于是三件事一次到位：
   *   1. 策略不被绕开——一条扫描脚本的 PreToolUse hook 在 saved run 上也能看到真正的脚本；
   *   2. 跨版本可见——入参通道对每个客户端版本都是无 schema 的透传，而 display 通道不是；
   *   3. 确认与执行同字节——只解析一次，那份字节一路带到 handler，不存在批准 A 跑 B。
   *
   * 因此返回值必须仍然满足 `inputSchema` / `runtimeInputSchema`（hook 改写后 executor 会
   * 再校验一次）。解析失败回 {@link ToolHandlerFailure}，executor 在 hook 之前收口——那是
   * 业务失败，不是基础设施故障，不该先打断用户一次确认。
   */
  resolveInput?: (
    input: unknown,
    context: ToolInputResolutionContext,
  ) => Promise<ToolInputResolutionResult> | ToolInputResolutionResult;
  formatModelContent?: (output: unknown) => ModelMessageContent;
  formatPersistedModelContent?: (
    input: ToolPersistedModelContentInput,
  ) => ModelMessageContent | undefined;
  resolveTimeoutBudgetMs?: (
    input: unknown,
    context?: ToolExecutionModelContext,
  ) => number | undefined;
  resolvePermissionCapability?: (
    input: unknown,
    context?: ToolRuntimePermissionCapabilityContext,
  ) => ToolRuntimePermissionCapability | undefined;
  resolvePermissionRulePolicy?: (
    input: unknown,
    context?: ToolRuntimePermissionCapabilityContext,
  ) => ToolPermissionRulePolicy | undefined;
  /**
   * Last word on an `ask` decision, owned by the tool. Runs after the permission service
   * has already decided to ask, so it can only narrow the ask to a pass (`proceed`) or
   * enrich it with a preview — it can never turn an allow into an ask.
   *
   * Synchronous like the other permission hooks: it inspects the input the executor
   * already holds and must not perform I/O on the approval path. A tool that needs to
   * read the world before it can build a preview belongs in {@link resolveInput}, which
   * runs earlier, is async, and whose result the whole downstream chain shares.
   */
  prepareApproval?: (input: unknown) => ToolApprovalGate;
  inputSchema: JsonSchema;
  runtimeInputSchema?: unknown;
  runtimeOutputSchema?: unknown;
  timeout: ToolTimeoutPolicy;
  cancellation: ToolCancellationPolicy;
}
export type ToolApprovalGate =
  | { gate: "proceed" }
  | { gate: "ask"; display?: ToolResultDisplayPayload };
export interface ToolPermissionRulePolicy {
  evaluateRules: (
    behavior: PermissionRuleBehavior,
    rules: readonly PermissionRuleValue[],
  ) => boolean;
  suggestedPermissionUpdates: PermissionUpdate[];
}
export interface ToolPersistedModelContentInput {
  output: unknown;
  content: string;
  persistedPath: string;
  originalBytes: number;
}
export interface ToolRuntimePermissionCapability {
  allowedInPlanMode?: boolean;
  destructive?: boolean;
  needsApproval?: boolean;
  readOnly?: boolean;
  requiresUserInteraction?: boolean;
  riskLevel?: RiskLevel;
  sideEffectScope?: ModelToolSideEffectScope;
  permission?: Partial<ToolContractDeclaration["permission"]>;
}
export interface ToolRuntimePermissionCapabilityContext {
  runtimeScope?: ToolRuntimeScope;
  workingDirectory?: string;
  workspaceRoot?: string;
}
export interface ToolExecutionModelContext {
  model?: Model;
}
export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  output: unknown;
  turnControl?: ToolExecutionTurnControl;
  followUpUserInput?: ToolExecutionFollowUpUserInput;
  display?: ToolResultDisplayPayload;
  modelContent?: ModelMessageContent;
  readFileStateMetadata?: PersistedReadFileStateMetadata;
  serialization?: ToolResultSerialization;
  /** Executor 汇总后的内部性能事实；不进入模型可见 Tool Output。 */
  performance?: ToolExecutionTelemetry;
  error?: {
    code?: string;
    detail?: string;
    type: string;
    message: string;
    reasonSource?: PermissionBrokerReasonSource;
    stack?: string;
  };
  durationMs: number;
  startedAt: Date;
  completedAt: Date;
}
export interface ToolExecutionFollowUpUserInput {
  input: string;
  reasonSource: PermissionBrokerReasonSource;
}
export interface ToolExecutionTurnControl {
  reason: "automation_create_limit" | "plan_exit_denied" | "subagent_terminal";
  stopTurnAfterResult: boolean;
}
export interface ToolResultSerialization {
  content: string;
  modelContent?: ModelMessageContent;
  originalBytes: number;
  /**
   * 实际进入模型请求的字节。对受保护 CUA 结构化帧，序列化文本里 image 块
   * 只渲染为短占位符，但真实 base64 栅格原样发送——因此这里 = 序列化文本
   * 字节 + 真实媒体载荷，成本/用量观测（setOutputBytes、turn-tool-usage、
   * usage-observability）不得少计图片。该 aggregate 是唯一公开计量状态。
   */
  returnedBytes: number;
  truncated: boolean;
  budgetStrategy: ToolResultBudgetStrategy;
  artifactPath?: string;
}
export interface ToolBatchResult {
  toolCallId: string;
  results: ToolExecutionResult[];
  allSucceeded: boolean;
}
export interface ExecutableToolCall {
  id: string;
  name: string;
  input: unknown;
}
export type ToolBatchEvent =
  | { type: "batch_start"; parallelGroupIndex: number; toolCallIds: string[] }
  | {
      type: "batch_complete";
      parallelGroupIndex: number;
      results: ToolExecutionResult[];
    }
  | { type: "tool_start"; toolCallId: string }
  | { type: "tool_complete"; result: ToolExecutionResult }
  | { type: "error"; error: Error; toolCallId?: string };
```

### `apps/cli/packages/core/src/tool/webfetch-preapproved.ts`

继承分类 `upstream-unchanged`，116 行。导出 1 个声明、0 条 re-export。

```ts
export function isWebFetchPreapprovedUrl(value: string): boolean;
```

## 纯数据常量表

合同写死键名与数值的纯数据常量表按规则拆在同名声明文件 `<原名>-data.ts` 里：只放普通数组与
普通对象字面量（可 `as const`），不含函数、条件、计算、`split`、展开或模板插值。原文件 import
这些常量，其余逻辑照常。声明模式计分时，下列名字（连同它们所在的整块声明）按本文件剔除：

- `apps/cli/packages/core/src/tool/webfetch-preapproved-data.ts`：`PREAPPROVED_HOSTS`、
  `PREAPPROVED_PREFIX_ROWS`
