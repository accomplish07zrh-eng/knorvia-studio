# services-02 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

机器生成：`node --import tsx specs/contracts/services-02/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。

覆盖范围：`packages/services/src/studio-runtime/` 的 **17 个文件**（10 声明 + 4 端口下沉 + 2 入口 + 1 示例）。

## 端口下沉说明（本包的结构性决策）

4 个端口文件从 `studio-runtime/app/` 下沉到契约层根目录：

| 原路径                                       | 新路径                                   |
| -------------------------------------------- | ---------------------------------------- |
| `studio-runtime/app/ports.ts`                | `studio-runtime/ports.ts`                |
| `studio-runtime/app/storePort.ts`            | `studio-runtime/storePort.ts`            |
| `studio-runtime/app/imagePort.ts`            | `studio-runtime/imagePort.ts`            |
| `studio-runtime/app/workspaceRuntimePort.ts` | `studio-runtime/workspaceRuntimePort.ts` |

**接口签名不变，只改位置与 import 路径**。下沉后 `adapters → app` 的 7 处依赖归零，依赖方向变为 `contracts ← domain ← app-* ← adapters-*`。

**引用面**：4 个端口共 94 处引用（全部在 `packages/services/` 内，包外 0 次），其中 `packages/services/test/` 有 5 处 —— **只改 import 路径，测试断言零改动**。

## 兼容入口面

- **契约声明**：10 个模块路径必须可用，导出名与签名不变。
- **端口**：下沉到 `studio-runtime/` 根目录后，**新路径**是兼容面；替换阶段还会在旧路径保留一层 re-export 壳（见 design.md），使存量引用不必一次性迁移。
- **入口**：`module.ts`、`node.ts` 的装配函数签名不变。
- **示例**：`contract.example.ts` **不属于公开 API**，仅为契约用法示例与编译期兼容性检查。

## 不在兼容面上的东西

- `studio-runtime/app/` 的其余 41 个文件（归 services-04 / 05 / 06）；
- `studio-runtime/adapters/`（归 services-07 / 08）；
- `studio-runtime/domain/`（归 services-03）。

## 契约声明（10 件）

### `packages/services/src/studio-runtime/agentToolTypes.ts`

导出 8 项（运行时 0 / 纯类型 8），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioAgentPolicy {
  maxActive: number;
  maxTasks: number;
  maxDepth: number;
  maxRounds: number;
  maxAttempts: number;
  timeoutMs: number;
  deliveryAttempts: number;
  retryMs: number;
}
export type StudioAgentTaskState =
  | "sent"
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "needs-input"
  | "cancelled"
  | "cancel-unconfirmed";
export interface StudioAgentTask {
  id: string;
  parentRunId: string;
  parentCallerId: string;
  parentAttempt: number;
  rootRunId: string;
  depth: number;
  targetId: string;
  runId: string;
  kernel: StudioKernelId;
  permission: StudioPermission;
  model?: string;
  reasoningEffort?: string;
  rounds: number;
  createdAt: number;
  workspace: { runId: string; stepId: string; path: string; sourcePath: string };
}
export interface StudioAgentResultRef {
  id: string;
  taskId: string;
  runId: string;
  attempt: number;
  state: StudioAgentTaskState;
  error?: string;
  resultKnown?: boolean;
  steps: Array<{ stepId: string; resultId: string }>;
  workspaces: Array<{ runId: string; stepId: string; path: string }>;
  artifacts: StudioAgentArtifactRef[];
}
export interface StudioAgentArtifactRef {
  runId: string;
  stepId: string;
  path: string;
  change: "added" | "modified" | "deleted";
}
export interface StudioAgentEvent {
  id: string;
  taskId: string;
  runId: string;
  attempt: number;
  state: StudioAgentTaskState;
  resultRef: StudioAgentResultRef;
  delivery: "pending" | "sent" | "acked" | "exhausted";
  deliveries: number;
  retryAt: number;
  createdAt: number;
}
export interface StudioAgentTools {
  call(name: string, input: unknown): Promise<unknown>;
}
export interface StudioAgentFullResult extends StudioAgentResultRef {
  results: Array<{ stepId: string; result: StudioStepResult }>;
  textPage?: { offset: number; nextOffset: number; total: number; done: boolean };
  artifactPage?: { offset: number; nextOffset: number; total: number; done: boolean };
}
```

### `packages/services/src/studio-runtime/attentionTypes.ts`

导出 2 项（运行时 0 / 纯类型 2），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioAttentionItem {
  id: string;
  object: "run" | "interaction";
  version: string;
  category: "pending" | "failed" | "completed";
  unread: boolean;
  runId: string;
  attempt: number;
  targetId: string;
  targetKind: StudioRun["kind"];
  title: string;
  workspacePath: string;
  kernels: StudioKernelId[];
  state: StudioRunState;
  updatedAt: number;
  interactionKind?: "approval" | "question";
  interactionId?: string;
  nativeSessionId?: string;
  targetDeleted: boolean;
  kernelUnavailable: boolean;
  resultUnknown: boolean;
}
export interface StudioAttentionProjection {
  items: StudioAttentionItem[];
  counts: { pending: number; failed: number; completed: number };
}
```

### `packages/services/src/studio-runtime/contract.ts`

导出 33 项（运行时 29 / 纯类型 4），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export * from "./kernelTypes.js";
export * from "./imageTypes.js";
export * from "./domain/imageInput.js";
export * from "./workflowTypes.js";
export * from "./types.js";
export * from "./workspaceRuntimeTypes.js";
export * from "./workspaceReviewTypes.js";
export * from "./workspaceImageTypes.js";
export { studioImagePath } from "./domain/workspaceImage.js";
export { sameImageVersion } from "./domain/workspaceImage.js";
export { STUDIO_IMAGE_PREVIEW_BYTES } from "./domain/workspaceImage.js";
export { STUDIO_IMAGE_PREVIEW_MAX_PIXELS } from "./domain/workspaceImage.js";
export { STUDIO_IMAGE_PREVIEW_MAX_DIMENSION } from "./domain/workspaceImage.js";
export * from "./agentToolTypes.js";
export * from "./attentionTypes.js";
export * from "./domain/outputRef.js";
export * from "./domain/reference.js";
export { validateStudioWorkflow } from "./domain/workflowGraph.js";
export { stricterStudioPermission } from "./domain/workflowGraph.js";
export { studioWorkflowNodeRequirement } from "./domain/workflowGraph.js";
export { studioWorkflowOutputInstruction } from "./domain/workflowGraph.js";
export { studioWorkflowOutputNames } from "./domain/workflowGraph.js";
export { studioWorkflowParams } from "./domain/workflowGraph.js";
export { resolveStudioWorkflowParams } from "./domain/workflowGraph.js";
export { validateStudioWorkflowPermissions } from "./domain/workflowGraph.js";
export { studioConditionReferences } from "./domain/condition.js";
export { studioRestartDisplay } from "./app/runOutcomeProjection.js";
export { STUDIO_ACCEPTANCE_KIND } from "./app/runOutcomeProjection.js";
export type { StudioRestartInput } from "./app/runOutcomeProjection.js";
export type StudioCommand = { commandId: string } & (
  | import("./workspaceReviewTypes.js").StudioReviewCommand
  | { type: "configure"; kernel: StudioKernelId; config: StudioKernelConfig }
  | { type: "create-conversation"; id: string; kernel: StudioKernelId; workspacePath: string }
  | {
      type: "save-group";
      group: StudioGroupDefinition;
      onlyIfAbsent?: boolean;
      /** 编辑所依据的服务端 `updatedAt`；与当前记录不一致时拒绝，防止多窗口静默覆盖。 */
      baseUpdatedAt?: number;
    }
  | {
      type: "save-workflow";
      workflow: StudioWorkflowDefinition;
      onlyIfAbsent?: boolean;
      baseUpdatedAt?: number;
    }
  | { type: "delete"; kind: "conversation" | "group" | "workflow"; id: string }
  | {
      type: "send";
      kind: "chat" | "group" | "workflow";
      targetId: string;
      text: string;
      attachments?: import("./imageTypes.js").StudioImageInput[];
      /** 本次贴图的目录模型快照；不改写会话的 CLI 默认偏好。 */
      imageModel?: string;
      taskMode?: boolean;
      selection?: StudioChatSelection;
      /** A caller-owned per-turn snapshot; avoids mutating a remote Host's global CLI settings. */
      kernelConfig?: StudioKernelConfig;
      /** 工作流节点的参数提交值；受理时与默认值合并后冻结，之后不再读取界面草稿。 */
      params?: Record<string, string>;
      /** 本次运行的授权上限；与每个节点的要求取更严格的一方（见 specs/knorvia-host-references.md）。 */
      permission?: StudioPermission;
    }
  | { type: "cancel"; runId: string }
  | { type: "steer"; runId: string; text: string }
  | { type: "resume"; runId: string; retryUncertain: boolean }
  | { type: "answer"; interactionId: string; answer: StudioKernelAnswer }
  | { type: "attention-read"; object: "run" | "interaction"; id: string; version: string }
);
export interface StudioCommandResult {
  /** Host 明确在入队前拒绝图片；与传输失败/未知 ACK 区分。 */
  imageRejection?: string;
  reviewDraft?: import("./workspaceReviewTypes.js").StudioReviewDraft;
  id: string;
  revision: number;
}
export interface IStudioRuntimeService {
  /** Host-owned runtime of an existing run/step workspace; controls acknowledge admission. */
  workspaceRuntime(
    params: import("./workspaceRuntimeTypes.js").StudioWorkspaceRuntimeRequest,
  ): Promise<import("./workspaceRuntimeTypes.js").StudioWorkspaceRuntimeState>;
  overview(): Promise<StudioOverview>;
  timeline(
    targetId: string,
    before?: number,
    focusRunId?: string,
    imageId?: string,
    admissionCommandId?: string,
  ): Promise<StudioTimeline>;
  command(command: StudioCommand): Promise<StudioCommandResult>;
  // 可选探测选项：refresh 表示用户显式要求重新探测，必须绕过探测缓存。
  inspectKernels(options?: StudioKernelInspectOptions): Promise<StudioKernelStatus[]>;
  kernelOptions(params: {
    kernel: StudioKernelId;
    workspacePath?: string;
    model?: string;
  }): Promise<StudioKernelOptions>;
  manageKernel(params: {
    kernel: StudioKernelId;
    action: "install" | "update" | "uninstall" | "update-existing";
  }): Promise<StudioKernelStatus>;
  workspaceChanges(
    params: import("./workspaceImageTypes.js").StudioWorkspaceChangesRequest,
  ): Promise<StudioWorkspaceChange[]>;
  /**
   * 应用成功后由服务层写入验收记录（辅助证据，`apply-acceptance` kind）。
   * 该记录**不是**任务终态，`run` / `step-result` / `turn` 仍然是任务状态的唯一所有者。
   */
  applyWorkspaceChanges(
    params: import("./workspaceImageTypes.js").StudioWorkspaceApplyRequest,
  ): Promise<void>;
  /** Called only by an authenticated Studio peer bound to this Host's remote workspace. */
  prepareAgentWorkspace(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string>;
  agentWorkspaceChanges(
    params: import("./workspaceImageTypes.js").StudioWorkspaceChangesRequest,
  ): Promise<StudioWorkspaceChange[]>;
  /**
   * 远端 Host 可以返回它自己的应用回执；
   * 返回 `void` 时本地 Host 只能记录"未返回摘要"，**不得**当作已核验。
   */
  applyAgentWorkspaceChanges(
    params: import("./workspaceImageTypes.js").StudioWorkspaceApplyRequest,
  ): Promise<StudioApplyReceipt | void>;
  onDidChange: Event<{ revision: number }>;
}
export const IStudioRuntimeService =
  createServiceDescriptor<IStudioRuntimeService>("studio-runtime");
```

### `packages/services/src/studio-runtime/imageTypes.ts`

导出 4 项（运行时 1 / 纯类型 3），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioImageRef {
  id: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
}
export interface StudioImageInput extends StudioImageRef {
  dataBase64: string;
}
export interface StudioImageReadResult {
  input?: StudioImageInput;
  error?: string;
}
export const STUDIO_IMAGE_LIMITS = …;
```

### `packages/services/src/studio-runtime/kernelTypes.ts`

导出 24 项（运行时 2 / 纯类型 22），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export type LocalStudioKernelId =
  | "knorvia"
  | "codex"
  | "claude-code"
  | "grok-build"
  | "opencode"
  | "qoder"
  | "qoder-cn"
  | "gemini-cli"
  | "antigravity"
  | "goose"
  | "kimi-cli"
  | "copilot"
  | "hermes"
  | "qwen-code"
  | "mistral-vibe"
  | "deepseek-harness"
  | "devin"
  | "cursor"
  | "factory-droid"
  | "cline"
  | "auggie"
  | "junie"
  | `acp:${string}`;
export type StudioKernelId = LocalStudioKernelId | `ssh:${string}:${LocalStudioKernelId}`;
export type StudioPermission = "read-only" | "ask" | "full-access";
export interface StudioKernelConfig {
  executablePath: string;
  permission: StudioPermission;
  model?: string;
  reasoningEffort?: string;
}
export interface StudioChatSelection {
  model?: string;
  reasoningEffort?: string;
}
export interface StudioKernelOptions {
  commands?: Array<{ name: string; description: string; inputHint?: string }>;
  models: Array<{
    id: string;
    label: string;
    description?: string;
    reasoning: Array<{ id: string; label: string }>;
    defaultReasoning?: string;
    /** 缺失表示未核验，空数组或只有 text 表示明确没有图片。 */
    inputModalities?: Array<"text" | "image" | "audio">;
  }>;
  defaultModel?: string;
  error?: string;
  sharedResourceWarnings?: string[];
}
export interface StudioKernelCapabilities {
  resume: boolean;
  approval: boolean;
  questions: boolean;
  readOnly: boolean;
  fullAccess: boolean;
}
export interface StudioKernelStatus {
  id: StudioKernelId;
  displayName?: string;
  management?: "studio" | "external";
  installed: boolean;
  version?: string;
  executablePath?: string;
  origin: "builtin" | "managed" | "external" | "missing";
  capabilities: StudioKernelCapabilities;
  /** Verified in-app update path for an existing local installation, if any. */
  externalUpdate?: "native" | "npm";
  error?: string;
  /** Present only for SSH-discovered agents; used for clear host/project routing in the GUI. */
  remoteWorkspacePath?: string;
  remoteEnvironmentLabel?: string;
  /**
   * Layered probe evidence (locate/version/protocol/auth). Optional: older persisted records,
   * rejected manifests and SSH-relayed statuses carry only the legacy fields above.
   */
  probe?: StudioKernelProbe;
}
export interface StudioKernelInspectOptions {
  refresh?: boolean;
}
export type StudioSharedMcpServer =
  | {
      name: string;
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  | {
      name: string;
      type: "http" | "sse";
      url: string;
      headers: Record<string, string>;
    };
export interface StudioQuestion {
  id: string;
  title: string;
  options: Array<string | { label: string; description?: string }>;
  multiple?: boolean;
}
export interface StudioKernelInteraction {
  id: string;
  kind: "approval" | "question";
  title: string;
  detail?: string;
  questions?: StudioQuestion[];
  choices?: string[];
}
export interface StudioKernelAnswer {
  decision?: "allow-once" | "allow-session" | "deny";
  answers?: Record<string, string[]>;
}
export interface StudioKernelUsage {
  scope?: "request" | "turn" | "reported";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  modelSteps?: number;
}
export type StudioToolState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "unknown";
export interface StudioToolDetail {
  input?: string;
  output?: string;
  /** 脱敏且有界的原生 typed content JSON；不是 raw output。 */
  content?: string;
  statusDetail?: string;
}
export interface StudioKernelMedia {
  kind: "image" | "video" | "audio" | "file";
  mimeType?: string;
  name?: string;
  /** http(s)、file:// 或本机绝对路径。 */
  uri?: string;
  /** 内联内容；由内核注册表落盘为文件后改为 `uri`，不进入数据库。 */
  dataBase64?: string;
  /** 内联内容超过保存上限时只保留名称。 */
  omitted?: "too-large";
}
export type StudioKernelEvent =
  | { type: "session"; sessionId: string }
  | { type: "media"; items: StudioKernelMedia[] }
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "reasoning"; text: string }
  | (StudioToolDetail & {
      type: "tool";
      id: string;
      name: string;
      state: StudioToolState;
      /** 旧远端消息只含 text 时传回原历史详情，不能把它推断为 output。 */
      legacyText?: string;
    })
  | ({ type: "usage" } & StudioKernelUsage);
export interface StudioKernelTurn {
  runId: string;
  turnId: string;
  /** Stable for one run/step attempt, including across an uncertain SSH reconnect. */
  dispatchId?: string;
  workspaceMode?: "isolated" | "shared";
  workspaceRunId?: string;
  workspaceStepId?: string;
  conversationId: string;
  kernel: StudioKernelId;
  workspacePath: string;
  nativeSessionId?: string;
  executablePath?: string;
  model?: string;
  reasoningEffort?: string;
  permission: StudioPermission;
  text: string;
  attachments?: import("./imageTypes.js").StudioImageInput[];
  sharedMcpServers?: StudioSharedMcpServer[];
  /** Studio-owned private per-turn bridge config; removed after the native CLI exits. */
  sharedMcpConfigPath?: string;
}
export interface StudioKernelTurnResult {
  status: "succeeded" | "failed" | "cancelled" | "interrupted";
  text: string;
  nativeSessionId?: string;
  error?: string;
  resultKnown: boolean;
  retryable?: boolean;
  /** The remote member's actual project, not the local orchestration project. */
  workspacePath?: string;
  changesSummary?: string;
}
export interface StudioKernelSink {
  emit(event: StudioKernelEvent): Promise<void>;
  /** Native withdrawal cancels only this question, not the surrounding turn. */
  ask(interaction: StudioKernelInteraction, signal?: AbortSignal): Promise<StudioKernelAnswer>;
}
export interface StudioKernelAdapter {
  run(
    turn: StudioKernelTurn,
    sink: StudioKernelSink,
    signal: AbortSignal,
  ): Promise<StudioKernelTurnResult>;
}
export * from "./adapters/kernels/probeResult.js";
export * from "./domain/capabilityMatrix.js";
```

### `packages/services/src/studio-runtime/types.ts`

导出 26 项（运行时 0 / 纯类型 26），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export type StudioRunState =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface StudioConversation {
  selection?: StudioChatSelection;
  id: string;
  kernel: StudioKernelId;
  workspacePath: string;
  title: string;
  nativeSessionId?: string;
  createdAt: number;
  updatedAt: number;
}
export type StudioMediaRef = Omit<import("./kernelTypes.js").StudioKernelMedia, "dataBase64">;
export interface StudioMessage extends StudioToolDetail {
  attachments?: import("./imageTypes.js").StudioImageRef[];
  /** `kind: "media"` 时的内核产出媒体。 */
  media?: StudioMediaRef[];
  sequence?: number;
  id: string;
  targetId: string;
  runId: string;
  turnId?: string;
  sender: "user" | StudioKernelId | "system";
  kind: "text" | "reasoning" | "tool" | "progress" | "media";
  text: string;
  name?: string;
  state?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudioInteraction extends StudioKernelInteraction {
  runId: string;
  turnId: string;
  kernel?: StudioKernelId;
  status: "pending" | "answered" | "expired";
}
export interface StudioRun {
  admissionCommandId?: string;
  attachments?: import("./imageTypes.js").StudioImageRef[];
  workspaceStepIds?: string[];
  kernelConfig?: StudioKernelConfig;
  id: string;
  kind: "chat" | "group" | "workflow";
  targetId: string;
  state: StudioRunState;
  input: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  resultKnown?: boolean;
  checkpoint: StudioCheckpoint;
  attempt: number;
  cancelRequested?: boolean;
  taskMode?: boolean;
  definition?: StudioGroupDefinition | StudioWorkflowDefinition;
  /**
   * 交付结论：读时派生的只读投影（见 specs/knorvia-delivery-summary.md）。
   * 不存在第二份状态：本字段永远由 Host 证据推导，绝不写回记录。
   */
  outcome?: StudioRunOutcome;
}
export type StudioDeliveryOutcome = "produced" | "checked" | "unverified" | "unknown";
export type StudioDeliveryEvidence =
  | "host-hash"
  | "apply-journal"
  | "creation-record"
  | "kernel-tool-state"
  | "model-claim"
  | "none";
export type StudioRestartDisplayState =
  | "applied-refresh-failed"
  | "partial-unknown"
  | "accepted-later-modified";
export type StudioAcceptanceConfirmation = "host-verified" | "host-journal" | "remote-returned";
export type StudioAcceptanceResult =
  | "accepted"
  | "applied-unverified"
  | "remote-unverified"
  | "failed";
export type StudioApplyJournalState =
  | "preparing"
  | "applying"
  | "rolling-back"
  | "complete"
  | "rolled-back"
  | "rollback-incomplete";
export interface StudioApplyLockState {
  recoveryRequired?: boolean;
  phase?: "applying" | "verifying";
  operationId?: string;
  startedAt?: number;
}
export interface StudioAcceptedFileVersion {
  path: string;
  afterHash: string | null;
}
export interface StudioAppliedFile {
  path: string;
  afterHash: string | null;
}
export interface StudioApplyReceipt {
  operationId: string;
  files: StudioAppliedFile[];
  /** 选中路径中已与项目一致而被跳过的数量。 */
  skipped?: number;
  journalState: StudioApplyJournalState;
}
export interface StudioFileVersion {
  path: string;
  hash: string | null;
}
export interface StudioApplyAcceptance {
  version: 1;
  /** 业务运行身份：交付摘要按它查询，必须与 `run`/`step-result` 记录一致。 */
  runId: string;
  stepId: string;
  /**
   * 物理工作区身份：群聊成员工作区会复用，文件操作与恢复定位用它。
   * 它与业务运行身份不是同一个值（群聊下形如 `group-<群组ID>...`），因此单独存放，
   * 不用同名字段表达两件事。旧记录可能没有这两个字段。
   */
  workspaceRunId?: string;
  workspaceStepId?: string;
  projectKey: string;
  operationId: string;
  acceptedAt: number;
  paths: string[];
  fileVersions: StudioAcceptedFileVersion[];
  creation?: { jobId: string; outputIds: string[] } | null;
  confirmation: StudioAcceptanceConfirmation;
  result: StudioAcceptanceResult;
  journalState?: StudioApplyJournalState;
}
export interface StudioRunStepOutcome {
  stepId: string;
  outcome: StudioDeliveryOutcome;
  /** 按优先级排列的证据来源；`model-claim` 只说明"这是声明"，不代表成立。 */
  evidence: StudioDeliveryEvidence[];
  /** 隔离目录所属的 workspace 步骤 id（群聊成员为成员 id）；用于定位隔离改动。 */
  workspaceStepId?: string;
  workspacePath?: string;
  /** 该步骤最新一条验收记录（只读证据）；UI 用它配合复核读取判定重启后显示状态。 */
  acceptance?: StudioApplyAcceptance;
  restart?: StudioRestartDisplayState;
}
export interface StudioRunOutcome {
  outcome: StudioDeliveryOutcome;
  evidence: StudioDeliveryEvidence[];
  steps: StudioRunStepOutcome[];
  restart?: StudioRestartDisplayState;
}
export interface StudioTurnSnapshot {
  kernel?: StudioKernelId;
  conversationId?: string;
  workspacePath?: string;
  nativeSessionId?: string;
  permission?: import("./kernelTypes.js").StudioPermission;
  id: string;
  runId: string;
  stepId: string;
  state: string;
  attempt: number;
  memberId?: StudioKernelId;
  startedAt?: number;
  endedAt?: number;
}
export interface StudioGroupMemberMetrics {
  member: StudioKernelId;
  /** Sum of reported fields only; partial marks missing or request-scoped usage. */
  tokens?: number;
  durationMs?: number;
  tokensPartial: boolean;
  durationPartial: boolean;
}
export interface StudioGroupMetrics {
  runId: string;
  members: StudioGroupMemberMetrics[];
  total: Omit<StudioGroupMemberMetrics, "member">;
  truncated: boolean;
}
export interface StudioOverview {
  attention?: import("./attentionTypes.js").StudioAttentionProjection;
  revision: number;
  configs: Partial<Record<StudioKernelId, StudioKernelConfig>>;
  conversations: StudioConversation[];
  groups: StudioGroupDefinition[];
  workflows: StudioWorkflowDefinition[];
  runs: StudioRun[];
}
export interface StudioTimeline {
  admission?: { commandId: string; runId: string };
  image?: import("./imageTypes.js").StudioImageReadResult;
  reviewDrafts?: import("./workspaceReviewTypes.js").StudioReviewDraft[];
  revision: number;
  nextBefore?: number;
  messages: StudioMessage[];
  interactions: StudioInteraction[];
  runs: StudioRun[];
  turns?: StudioTurnSnapshot[];
  usage?: StudioKernelUsage & { runId: string; turnId: string };
  groupMetrics?: StudioGroupMetrics;
}
export interface StudioWorkspaceChange {
  /** 仅 `artifactsOnly` 请求返回：该网页在本机隔离工作副本中的绝对路径，用于格子预览。 */
  previewPath?: string;
  imagePreview?: import("./workspaceImageTypes.js").StudioWorkspaceImagePair;
  version?: import("./workspaceReviewTypes.js").StudioReviewFileVersion;
  path: string;
  kind: "added" | "modified" | "deleted";
  before: string | null;
  after: string | null;
  binary?: boolean;
  conflict?: boolean;
}
```

### `packages/services/src/studio-runtime/workflowTypes.ts`

导出 18 项（运行时 5 / 纯类型 13），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export const STUDIO_WORKFLOW_NODE_KINDS = [
  "start",
  "agent",
  "creation",
  "condition",
  "parallel",
  "join",
  "approval",
  "end",
] as const;
export type StudioWorkflowNodeKind = (typeof STUDIO_WORKFLOW_NODE_KINDS)[number];
export const STUDIO_WORKFLOW_PARAM_TYPES = ["text", "number", "boolean"] as const;
export type StudioWorkflowParamType = (typeof STUDIO_WORKFLOW_PARAM_TYPES)[number];
export interface StudioWorkflowParam {
  /** 提示词里用 `{{param.<name>}}` 引用。 */
  name: string;
  label?: string;
  type: StudioWorkflowParamType;
  /** 缺省值；`required` 且无缺省值时提交必须给出值。 */
  default?: string;
  required?: boolean;
}
export type StudioWorkflowParamValues = Record<string, string>;
export const STUDIO_WORKFLOW_PERMISSION_KEY = "workflow-permission";
export const STUDIO_WORKFLOW_PARAMS_KEY = "workflow-params";
export interface StudioWorkflowNodeData {
  kind: StudioWorkflowNodeKind;
  label: string;
  kernel: StudioKernelId;
  prompt: string;
  condition: string;
  retryCount: number;
  retryDelay: number;
  joinPolicy: "all" | "any";
  creationModelId?: string;
  creationReferencePath?: string;
  /** 该节点声明的参数 schema；提示词用 `{{param.<name>}}` 引用。 */
  params?: StudioWorkflowParam[];
  /**
   * 该节点声明的输出**来源**：名字 + 从哪里取。
   * 见 `specs/knorvia-output-contract.md`「命名输出的生产规则」。
   */
  outputs?: StudioWorkflowOutputDeclaration[];
  /** 旧字段：只有名字、没有来源。没有 `outputs` 时才读它（按名字数推断来源）。 */
  outputNames?: string[];
  /** 该节点的执行要求；与运行授权取更严格的一方，见第 6 节。 */
  permission?: StudioPermission;
  [key: string]: unknown;
}
export const STUDIO_WORKFLOW_OUTPUT_SOURCES = ["text", "json", "file"] as const;
export type StudioWorkflowOutputSource = (typeof STUDIO_WORKFLOW_OUTPUT_SOURCES)[number];
export interface StudioWorkflowOutputDeclaration {
  name: string;
  from: StudioWorkflowOutputSource;
}
export interface StudioWorkflowNode {
  id: string;
  data: StudioWorkflowNodeData;
  position: { x: number; y: number };
  type?: string;
}
export interface StudioWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
}
export interface StudioWorkflowDefinition {
  id: string;
  name: string;
  workspacePath: string | null;
  nodes: StudioWorkflowNode[];
  edges: StudioWorkflowEdge[];
  updatedAt: number;
  workspaceMode?: "isolated" | "shared";
  /**
   * 定义契约版本；缺省为 legacy。
   * 高版本定义不在本进程静默降级，由读取侧显式拒绝并保留原始记录。
   */
  version?: number;
}
export interface StudioGroupDefinition {
  id: string;
  name: string;
  goal: string;
  members: StudioKernelId[];
  host: StudioKernelId;
  sharedSummary: string;
  mode: "manual" | "task";
  workspaceMode: "isolated" | "shared";
  workspacePath?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StudioStepResult {
  status: "succeeded" | "failed" | "cancelled" | "interrupted" | "skipped";
  text: string;
  error?: string;
  resultKnown: boolean;
  retryable?: boolean;
  /** Host-observed workspace evidence; never accepted from member prose. */
  workspacePath?: string;
  changesSummary?: string;
  /**
   * 增量输出引用；`text` 仍然必填并保持既有语义。
   * 只保存有界引用，不内联大文本／媒体字节，见 specs/knorvia-output-contract.md。
   */
  outputs?: StudioOutputRef[];
  /**
   * 输出契约版本；缺省为 legacy（无 `outputs` 的旧记录）。
   * 高版本结果不参与缓存复用，读取侧报错并保留原始记录。
   */
  version?: number;
}
export interface StudioCheckpoint {
  steps: Record<string, StudioStepResult>;
  values: Record<string, string>;
  completedRounds: number;
  plan?: unknown;
}
```

### `packages/services/src/studio-runtime/workspaceImageTypes.ts`

导出 5 项（运行时 0 / 纯类型 5），角色 `declaration`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioWorkspaceImageRequest {
  path: string;
  version: StudioReviewFileVersion;
}
export interface StudioWorkspaceChangesRequest {
  runId: string;
  stepId: string;
  imagePreview?: StudioWorkspaceImageRequest;
  /**
   * 工作台格子预览（specs/knorvia-workbench-artifact-preview-20261008.md）：只读列出隔离副本中
   * 改动的网页，返回项带 `previewPath`，不含内容；不加项目锁、不执行应用恢复，不要求同项目其他任务结束。
   */
  artifactsOnly?: boolean;
}
export interface StudioWorkspaceApplyRequest {
  runId: string;
  stepId: string;
  paths: string[];
  reviewedVersions?: StudioWorkspaceImageRequest[];
}
export type StudioWorkspaceImageSide =
  | { kind: "image"; mediaType: "image/png" | "image/jpeg"; dataBase64: string; totalBytes: number }
  | {
      kind: "unsupported";
      reason: "animated" | "invalid-format" | "multiple-images" | "display-budget";
    };
export interface StudioWorkspaceImagePair {
  version: StudioReviewFileVersion;
  before: StudioWorkspaceImageSide | null;
  after: StudioWorkspaceImageSide | null;
}
```

### `packages/services/src/studio-runtime/workspaceReviewTypes.ts`

导出 5 项（运行时 0 / 纯类型 5），角色 `declaration`，分类 `original`。签名逐字取自源码。

```ts
export interface StudioReviewFileVersion {
  beforeHash: string | null;
  afterHash: string | null;
  sourceHash: string | null;
}
export interface StudioReviewAnchor {
  path: string;
  side: "old" | "new";
  startLine: number;
  endLine: number;
  version: StudioReviewFileVersion;
}
export interface StudioReviewComment {
  id: string;
  anchor: StudioReviewAnchor;
  context: string;
  body: string;
}
export interface StudioReviewDraft {
  id: string;
  projectKey: string;
  targetId: string;
  runId: string;
  stepId: string;
  kernel: StudioKernelId;
  revision: number;
  comments: StudioReviewComment[];
  preview?: { id: string; commandId: string; summary: string };
  lastDelivery?: { runId: string; state?: StudioRunState; error?: string };
}
export type StudioReviewCommand = {
  type: "workspace-review";
  runId: string;
  stepId: string;
  draftId?: string;
  baseRevision: number;
} & (
  | { action: "save-comment"; commentId: string; body: string; anchor?: StudioReviewAnchor }
  | { action: "delete-comment"; commentId: string }
  | { action: "prepare" }
  | { action: "send"; previewId: string }
);
```

### `packages/services/src/studio-runtime/workspaceRuntimeTypes.ts`

导出 6 项（运行时 0 / 纯类型 6），角色 `declaration`，分类 `original`。签名逐字取自源码。

```ts
export type StudioWorkspaceRuntimePhase =
  | "idle"
  | "preparing"
  | "prepared"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed"
  | "interrupted"
  | "cleanup-required";
export type StudioWorkspaceRuntimeError =
  | "invalid-command"
  | "approval-required"
  | "read-only"
  | "unavailable"
  | "busy"
  | "setup-required"
  | "setup-failed"
  | "spawn-failed"
  | "port-conflict"
  | "readiness-failed"
  | "process-exited"
  | "cleanup-required"
  | "interrupted";
export interface StudioWorkspaceRuntimeCommand {
  executable: string;
  args: string[];
}
export type StudioWorkspaceRuntimeControl =
  | { action: "prepare"; approved: true; command?: StudioWorkspaceRuntimeCommand }
  | {
      action: "start";
      approved: true;
      command: StudioWorkspaceRuntimeCommand;
      healthPath?: string;
      timeoutMs?: number;
    }
  | { action: "stop" }
  | { action: "recover" };
export interface StudioWorkspaceRuntimeRequest {
  runId: string;
  stepId: string;
  control?: StudioWorkspaceRuntimeControl;
}
export interface StudioWorkspaceRuntimeState {
  workspacePath: string;
  phase: StudioWorkspaceRuntimePhase;
  prepared: boolean;
  updatedAt: number;
  canControl: boolean;
  port?: number;
  previewUrl?: string;
  errorCode?: StudioWorkspaceRuntimeError;
  exitCode?: number | null;
}
```

## 端口（4 件，从 app/ 下沉）

### `packages/services/src/studio-runtime/imagePort.ts`（端口，从 `packages/services/src/studio-runtime/app/imagePort.ts` 下沉）

导出 2 项（运行时 1 / 纯类型 1），角色 `port`，分类 `original`。签名逐字取自源码。

```ts
export interface StudioImageCodec {
  validate(input: StudioImageInput): void;
}
export function validateStudioTurnImages(
  codec: StudioImageCodec | undefined,
  kind: string,
  kernel: string,
  inputs?: StudioImageInput[],
): void;
```

### `packages/services/src/studio-runtime/ports.ts`（端口，从 `packages/services/src/studio-runtime/app/ports.ts` 下沉）

导出 8 项（运行时 0 / 纯类型 8），角色 `port`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioKernelRegistry {
  remoteWorkspace?(
    kernel: StudioKernelId,
  ):
    | Pick<IStudioRuntimeService, "agentWorkspaceChanges" | "applyAgentWorkspaceChanges">
    | undefined;
  options?(params: {
    kernel: StudioKernelId;
    workspacePath?: string;
    model?: string;
    config: StudioKernelConfig;
  }): Promise<import("../kernelTypes.js").StudioKernelOptions>;
  adapter(kernel: StudioKernelId): StudioKernelAdapter;
  inspect(configs: Record<StudioKernelId, StudioKernelConfig>): Promise<StudioKernelStatus[]>;
  manage(
    kernel: StudioKernelId,
    action: "install" | "update" | "uninstall" | "update-existing",
  ): Promise<StudioKernelStatus>;
  dispose(): Promise<void>;
}
export interface StudioAgentStep {
  id: string;
  kernel: StudioKernelId;
  prompt: string;
  attachments?: import("../imageTypes.js").StudioImageInput[];
  memberId?: string;
  permission?: StudioPermission;
  /**
   * 节点声明的命名输出（下游用 `{{ref.<name>}}` 引用）。
   * 生产者按它把 Agent 结果转成 `StudioStepResult.outputs`；未声明时不产出引用。
   */
  outputNames?: readonly string[];
  /** 每个输出名的来源（`text` / `json` / `file`）；缺省时按名字数推断。 */
  outputSources?: ReadonlyMap<string, string>;
  /**
   * 已核验的上游文件输出，需要在本次运行的隔离工作区准备好之后由 Host 复制进来。
   * 提示词里仍然是原来的相对路径：复制到目标工作区的**同一相对路径**，因此下游读到的是副本。
   */
  inputs?: readonly StudioStepInput[];
  signal?: AbortSignal;
}
export type StudioStepInput =
  | {
      kind: "workspace-file";
      name: string;
      sourceRunId: string;
      sourceStepId: string;
      relativePath: string;
      /** 记录时的哈希；给出时导入必须核对，不一致即拒绝。 */
      sha256?: string;
    }
  | {
      kind: "creation-output";
      name: string;
      /** 目标工作区内的落点（与绑定文本给下游的路径一致）。 */
      targetPath: string;
      sourcePath: string;
      sha256: string;
    };
export interface StudioImportReceipt {
  /** 导入到本次运行工作区内的相对路径。 */
  path: string;
  sourcePath: string;
  hash: string;
  size: number;
}
export interface StudioReferenceVersion {
  path: string;
  hash: string | null;
}
export interface StudioReferencePort {
  runId: string;
  /** 允许产出引用的步骤 id 前缀（例如 `workflow:n1:`）；解析侧按产出节点推导，可省略。 */
  stepOwners?: readonly string[];
  workspaceIdentity?: string;
  /** 重新读取 `workspace-file` 引用目标；不实现时该引用无法取证。 */
  fileVersion?(runId: string, stepId: string, relativePath: string): Promise<string | null>;
  /**
   * 经 CreationService 核对 `creation-output` 引用（归属、存在性、版本/哈希）。
   * 不实现时该引用无法取证，解析必须失败关闭。
   */
  creationOutputVersion?(
    jobId: string,
    outputId: string,
  ): Promise<{ exists: boolean; sha256: string | null } | null>;
}
export interface StudioExecutionPort {
  steering?(): Array<{ id: string; text: string }>;
  ackSteering?(ids: string[]): Promise<void>;
  attempt: number;
  signal: AbortSignal;
  checkpoint: StudioCheckpoint;
  /** Merge metadata atomically; only the run owner writes step outcomes. */
  saveCheckpoint(
    update: Partial<Pick<StudioCheckpoint, "values" | "completedRounds" | "plan">>,
  ): Promise<void>;
  agent(step: StudioAgentStep): Promise<StudioStepResult>;
  createMedia?(request: {
    nodeId: string;
    modelId: string;
    prompt: string;
    referencePath?: string;
    /**
     * 参考图来自**已核验的上游输出**时的受控输入计划。
     * 给出时 Host 必须按它重新核对来源、字节与哈希再交给 CreationService，
     * **不能**把展开后的占位路径当成项目内路径去读。
     */
    referenceInput?: StudioStepInput;
    /** 节点声明的命名输出；生产者按它把真实创作成果转成 `creation-output` 引用。 */
    outputNames?: readonly string[];
    signal: AbortSignal;
  }): Promise<StudioStepResult>;
  confirm(id: string, title: string, signal?: AbortSignal): Promise<boolean>;
  progress(text: string): Promise<void>;
  delay(milliseconds: number, signal?: AbortSignal): Promise<void>;
  now(): number;
  /** 引用解析上下文；缺省时结构化 `{{ref.*}}` 引用失败关闭。 */
  reference?: StudioReferencePort;
}
export interface StudioWorkspacePort {
  prepare(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    mode: "isolated" | "shared";
  }): Promise<string>;
  changes(
    runId: string,
    stepId: string,
    imagePreview?: import("../workspaceImageTypes.js").StudioWorkspaceImageRequest,
  ): Promise<StudioWorkspaceChange[]>;
  /** 只读扫描隔离工作副本中的网页产物；不取项目锁，不执行应用恢复。旧实现可不提供。 */
  artifacts?(runId: string, stepId: string): Promise<StudioWorkspaceChange[]>;
  /** 返回 Host 自己生成的应用回执；旧实现可以继续返回 `void`（此时无法取得操作 id）。 */
  apply(
    runId: string,
    stepId: string,
    paths: string[],
    reviewedVersions?: import("../workspaceImageTypes.js").StudioWorkspaceImageRequest[],
  ): Promise<StudioApplyReceipt | void>;
  /** 重新读取已发布的项目文件哈希，供验收取证；本地 Host 之外不适用。 */
  versions?(runId: string, stepId: string, paths: string[]): Promise<StudioFileVersion[]>;
  /**
   * 把工作区之外的输入复制进本次运行的工作区，并记录来源 + 真实版本。
   * 可选能力：不实现时不能导入外部文件（不得退化为直接读取任意路径）。
   */
  importFile?(params: {
    runId: string;
    stepId: string;
    sourcePath: string;
    name: string;
  }): Promise<StudioImportReceipt>;
  /** 读取本次运行内某步骤工作区文件的当前哈希；用于引用存在性与版本校验。 */
  referenceVersion?(
    runId: string,
    stepId: string,
    relativePath: string,
  ): Promise<StudioReferenceVersion>;
  /**
   * 把**已核验的上游输出**复制进本次运行的工作区，并把副本放到 `relativePath`。
   *
   * 与 `importFile` 的区别在来源：这里不接收调用方给的任意绝对路径。
   * `workspace-file` 按 (sourceRunId, sourceStepId, relativePath) 从上游工作区自己解析；
   * `creation-output` 的 `sourcePath` 由 Host 经 CreationService 解析，且**必须**带 `sha256`，
   * 导入前核对不符即拒绝。
   */
  importReference?(params: {
    runId: string;
    stepId: string;
    /** 目标工作区内的落点。 */
    relativePath: string;
    source:
      | {
          kind: "workspace-file";
          sourceRunId: string;
          sourceStepId: string;
          expectedSha256?: string;
        }
      | { kind: "creation-output"; sourcePath: string; sha256: string };
  }): Promise<StudioImportReceipt>;
}
```

### `packages/services/src/studio-runtime/storePort.ts`（端口，从 `packages/services/src/studio-runtime/app/storePort.ts` 下沉）

导出 7 项（运行时 0 / 纯类型 7），角色 `port`，分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StoredRun extends StudioRun {
  workspaceFeedback?: import("./workspaceReviewDraft.js").WorkspaceFeedback;
  owner?: string;
  taskMode?: boolean;
  workspaceGeneration?: string;
}
export interface StoredInteraction extends StudioInteraction {
  answer?: StudioKernelAnswer;
  owner?: string;
}
export interface StoredSession {
  id: string;
  nativeSessionId: string;
  workspacePath: string;
}
export interface StoredWorkspace {
  runId: string;
  stepId: string;
  path: string;
  sourcePath: string;
  remoteKernelId?: StudioKernelId;
}
export interface StudioListOptions {
  scope?: string;
  limit?: number;
  before?: number;
  pendingInteractionsOnly?: boolean;
  pendingSteeringOnly?: boolean;
  unresolvedRunsOnly?: boolean;
  oldestFirst?: boolean;
  /**
   * 返回全部记录；用于完整定义列表与不依赖最近历史窗口的待办事实投影。
   * overview 曾使用默认 1000 条上限，超过后最早的会话会从列表中静默消失。
   */
  all?: boolean;
}
export interface StudioRepository {
  read<T>(kind: string, id: string): T | undefined;
  list<T>(kind: string, options?: StudioListOptions): T[];
  queuedRuns(): StoredRun[];
  write<T>(kind: string, id: string, value: T, scope?: string): void;
  remove(kind: string, id: string): void;
  transaction<T>(operation: () => T): T;
  revision(): number;
  claim(owner: string, now: number): "owner" | "acquired" | "busy";
  owns(owner: string, now: number): boolean;
  release(owner: string): void;
  close(): void;
}
export interface StudioClock {
  now(): number;
  id(): string;
  delay(milliseconds: number, signal?: AbortSignal): Promise<void>;
}
```

### `packages/services/src/studio-runtime/workspaceRuntimePort.ts`（端口，从 `packages/services/src/studio-runtime/app/workspaceRuntimePort.ts` 下沉）

导出 3 项（运行时 0 / 纯类型 3），角色 `port`，分类 `original`。签名逐字取自源码。

```ts
export interface WorkspaceRuntimeProcessProof {
  rootPid: number;
  identities: Array<{
    pid: number;
    parentPid: number;
    processGroupId?: number;
    startToken: string;
  }>;
}
export interface WorkspaceRuntimeProcess {
  proof(): Promise<WorkspaceRuntimeProcessProof>;
  exited: Promise<{ code: number | null; conflict: boolean }>;
  alive(): boolean;
  stop(): Promise<boolean>;
}
export interface WorkspaceRuntimePort {
  reservePort(excluded: readonly number[]): Promise<{ port: number; release(): Promise<void> }>;
  spawn(
    workspacePath: string,
    command: StudioWorkspaceRuntimeCommand,
    port: number | undefined,
    onCreated: (proof: WorkspaceRuntimeProcessProof) => void,
  ): Promise<WorkspaceRuntimeProcess>;
  ready(process: WorkspaceRuntimeProcess, port: number, healthPath: string): Promise<boolean>;
  recover(proof: WorkspaceRuntimeProcessProof): Promise<boolean>;
}
```

## 入口（2 件）

### `packages/services/src/studio-runtime/module.ts`

导出 1 项（运行时 1 / 纯类型 0），角色 `entry`，分类 `unreviewed`。签名逐字取自源码。

```ts
export const studioRuntimeModule = …;
```

### `packages/services/src/studio-runtime/node.ts`

导出 3 项（运行时 2 / 纯类型 1），角色 `entry`，分类 `unreviewed`。签名逐字取自源码。

```ts
export { createCreationAgentBridge } from "./adapters/creationAgentBridge.js";
export type { CreationAgentBridge };
export function createStudioRuntimeService(options: {
  dataDir: string;
  taskService: IKnorviaTaskService;
  skillsService: Pick<ISkillsService, "list" | "buildPromptContext">;
  mcpSyncService: Pick<IMcpSyncService, "loadMcpFromUserDirectory">;
  pluginManagementService: Pick<IPluginManagementService, "listPlugins">;
  creationService?: ICreationService;
  creationBridge?: CreationAgentBridge;
  remoteEnvironments?: () => RemoteStudioEnvironment[];
  agentPolicy?: Partial<StudioAgentPolicy>;
  /** Trusted Host runtime placement; never accepted from agent tool arguments. */
  agentToolExecutablePath?: string;
}): StudioRuntimeService;
```

## 契约用法示例（1 件，非公开 API）

### `packages/services/src/studio-runtime/contract.example.ts`

导出 9 项（运行时 9 / 纯类型 0），角色 `example`，分类 `unreviewed`。签名逐字取自源码。

```ts
export const describedQuestion: StudioKernelInteraction = …;
export const unknownNativeTool: StudioKernelEvent = …;
export const markDisplayedAttentionRead: StudioCommand = …;
export function confirmPreparedWorkspaceReview(draft: StudioReviewDraft): StudioCommand;
export function reviewedSnapshotImageRequests(
  runId: string,
  stepId: string,
  reviewed: StudioWorkspaceImageRequest,
): { preview: StudioWorkspaceChangesRequest; apply: StudioWorkspaceApplyRequest };
export const newIndependentConversation: StudioCommand = …;
export const startPreparedWorkspace: StudioWorkspaceRuntimeRequest = …;
export function inspectWorkflowDraft(draft: StudioWorkflowDefinition);
export function dispatchConfiguredStudioChild(tools: StudioAgentTools);
```
