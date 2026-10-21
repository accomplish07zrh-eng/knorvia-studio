# services-03 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

机器生成：`node --import tsx specs/contracts/services-03/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；导出面测试的 oracle 是本文件的导出声明块。

覆盖范围：`packages/services/src/studio-runtime/domain/` 的 **31 个文件**（按功能簇分组，不按字母序）。

## 本包的定位

`studio-runtime/domain/` 是**纯逻辑层**：类型、校验、解析、策略计算，**不含 I/O、不含子进程**。

它被 `app/`（71 处）与 `adapters/`（61 处）向下依赖，自身**只依赖 `services-02` 的契约声明**。

**层内耦合极低**：31 个文件里只有 10 条层内依赖边（见 `scope.mjs` 的 `INTERNAL_EDGES`），

27 个文件互不引用 —— 说明这是一个「聚合包」而非「强内聚功能包」。

## 不在兼容面上

- `contract.ts`（聚合桶）对 `domain/imageInput`、`domain/outputRef`、`domain/reference` 的 `export *`：

  那是 `services-02` 的入口聚合职责，本包只保证这 3 个模块自身的导出面。

- `app/`（45 件）、`adapters/`（60 件）：分属 `services-04`～`services-08`。

## 内核策略与能力（kernel\*，5 件）

### `packages/services/src/studio-runtime/domain/kernelPolicy.ts`

导出 22 项（运行时 18 / 纯类型 4），分类 `unreviewed`。签名逐字取自源码。

```ts
export const MANAGED_KERNELS = ["codex", "claude-code", "grok-build"] as const;
export type ManagedKernelId = (typeof MANAGED_KERNELS)[number];
export const EXTERNAL_KERNELS = …;
export type KnownExternalKernel = (typeof EXTERNAL_KERNELS)[number];
export type ExternalKernel = KnownExternalKernel | `acp:${string}`;
export const RETIRED_KERNELS = ["gemini-cli"] as const;
export type RetiredKernelId = (typeof RETIRED_KERNELS)[number];
export function isRetiredKernel(id: string): id is RetiredKernelId;
export const RETIRED_KERNEL_MESSAGE = "该内核已从 Knorvia Studio 移除，历史记录仍可查看；请改选其他内核";
export function assertKernelNotRetired(id: string): void;
export function isManagedKernel(id: StudioKernelId): id is ManagedKernelId;
export function kernelCapabilities(id: StudioKernelId, version?: string): StudioKernelCapabilities;
export function capabilityAssessment(
  id: StudioKernelId,
  version?: string,
  exception?: { capability: StudioCapabilityId; reason?: string },
): StudioCapabilityAssessment;
export function assertKernelPermission(
  id: StudioKernelId,
  permission: StudioPermission,
  options?: { version?: string; exception?: { capability: StudioCapabilityId; reason?: string } },
): void;
export function record(value: unknown): Record<string, unknown>;
export function text(value: unknown): string;
export function list(value: unknown): unknown[];
export function number(value: unknown): number | undefined;
export function safeDetail(value: unknown): string;
export function errorText(error: unknown): string;
export function versionFrom(output: string): string | undefined;
export function validVersion(value: unknown): string;
```

### `packages/services/src/studio-runtime/domain/kernelIdentity.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export const STUDIO_KERNEL_IDS: readonly LocalStudioKernelId[] = …;
export function isLocalStudioKernelId(value: unknown): value is LocalStudioKernelId;
export function isStudioKernelId(value: unknown): value is StudioKernelId;
```

### `packages/services/src/studio-runtime/domain/kernelMedia.ts`

导出 8 项（运行时 8 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function mediaKindOf(mimeType?: string, location?: string): StudioKernelMedia["kind"];
export function acpContentMedia(value: unknown): StudioKernelMedia[];
export function locationValueMedia(value: unknown, depth = 0): StudioKernelMedia[];
export function acpToolMedia(update: Record_): StudioKernelMedia[];
export function codexItemMedia(item: Record_): StudioKernelMedia[];
export function claudeContentMedia(value: unknown): StudioKernelMedia[];
export function fingerprint(text: string): string;
export function dedupeMedia(items: StudioKernelMedia[]): StudioKernelMedia[];
```

### `packages/services/src/studio-runtime/domain/kernelPresentation.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function nativeApprovalDetail(value: Record<string, unknown>): string;
export function nativeQuestionOptions(value: unknown): StudioQuestion["options"];
export function nativeToolState(value: unknown): StudioToolState;
export function acpToolUpdate(update: Record<string, unknown>);
```

### `packages/services/src/studio-runtime/domain/kernelUsage.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function mergeKernelUsage(
  previous: StudioKernelUsage | undefined,
  next: StudioKernelUsage,
): StudioKernelUsage;
export function claudeInputTokens(usage: Record<string, unknown>): number | undefined;
```

## 工作流与引用解析（workflow*/reference*，6 件）

### `packages/services/src/studio-runtime/domain/workflowGraph.ts`

导出 12 项（运行时 11 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export { resolveStudioWorkflowParams } from "./workflowParams.js";
export { stricterStudioPermission } from "./workflowParams.js";
export { studioWorkflowNodeRequirement } from "./workflowParams.js";
export { studioWorkflowOutputInstruction } from "./workflowParams.js";
export { studioWorkflowOutputNames } from "./workflowParams.js";
export { studioWorkflowParams } from "./workflowParams.js";
export { validateStudioWorkflowPermissions } from "./workflowParams.js";
export interface StudioWorkflowGraph {
  nodes: Map<string, StudioWorkflowNode>;
  incoming: Map<string, StudioWorkflowEdge[]>;
  outgoing: Map<string, StudioWorkflowEdge[]>;
  order: string[];
}
export function studioWorkflowGraph(definition: StudioWorkflowDefinition): StudioWorkflowGraph;
export function workflowAncestors(graph: StudioWorkflowGraph, id: string): Set<string>;
export function validateStudioWorkflow(definition: StudioWorkflowDefinition): string[];
export function workflowAnyLosers(
  graph: StudioWorkflowGraph,
  joinId: string,
  winner: string,
): Set<string>;
```

### `packages/services/src/studio-runtime/domain/workflowParams.ts`

导出 11 项（运行时 11 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export const STUDIO_WORKFLOW_PARAM_LIMIT = 12;
export const STUDIO_WORKFLOW_OUTPUT_LIMIT = 32;
export function studioWorkflowParams(data: StudioWorkflowNodeData): StudioWorkflowParam[];
export function studioWorkflowOutputNames(data: StudioWorkflowNodeData): string[];
export function studioWorkflowOutputSources(
  data: StudioWorkflowNodeData,
): Map<string, StudioWorkflowOutputSource>;
export function studioWorkflowOutputInstruction(data: StudioWorkflowNodeData): string | undefined;
export function nodeParameterIssues(data: StudioWorkflowNodeData, id: string): string[];
export function stricterStudioPermission(
  left: StudioPermission | undefined,
  right: StudioPermission | undefined,
): StudioPermission;
export function studioWorkflowNodeRequirement(
  node: StudioWorkflowNode,
  authorisation: StudioPermission | undefined,
): { kernel: StudioKernelId; permission: StudioPermission };
export function validateStudioWorkflowPermissions(
  definition: StudioWorkflowDefinition,
  authorisation: StudioPermission | undefined,
  versions?: Partial<Record<string, string>>,
): string[];
export function resolveStudioWorkflowParams(
  definition: StudioWorkflowDefinition,
  provided: unknown,
): { values: StudioWorkflowParamValues; issues: string[] };
```

### `packages/services/src/studio-runtime/domain/reference.ts`

导出 20 项（运行时 12 / 纯类型 8），分类 `original`。签名逐字取自源码。

```ts
export { studioReferenceIdentity } from "./referencePath.js";
export { studioReferencePathReason } from "./referencePath.js";
export type { StudioReferenceReason } from "./referencePath.js";
export const STUDIO_REFERENCE_VERSION = 1;
export interface StudioReferenceContext {
  /** 当前运行的运行 id；`workspace-file` 引用必须属于它。 */
  runId: string;
  /**
   * 允许产出该引用的步骤 id 前缀集合（例如 `workflow:n1:`）。
   * 给出时，`stepId` 必须命中其中之一，否则按 `foreign-step` 拒绝。
   */
  stepOwners?: readonly string[];
  /** 当前运行的身份 key：`workspaceIdentity?.trim() || workspacePath`。 */
  workspaceIdentity?: string;
  /** 引用一侧记录的身份 key；两侧都非空且不同时拒绝。 */
  referenceWorkspaceIdentity?: string;
}
export interface StudioReferenceFileEvidence {
  exists: boolean;
  /** Host 重新读取得到的真实哈希；读不到时为 `null`。 */
  sha256: string | null;
}
export type StudioReferenceVerdict =
  | { ok: true; kind: StudioOutputRef["kind"]; relativePath?: string }
  | { ok: false; reason: StudioReferenceReason; detail: string };
export function studioReferenceOrigin(
  ref: unknown,
  context: StudioReferenceContext,
): StudioReferenceVerdict;
export function studioReferenceOwnership(
  ref: StudioOutputRef,
  context: StudioReferenceContext,
): StudioReferenceVerdict;
export function studioReferenceWorkspace(context: StudioReferenceContext): StudioReferenceVerdict;
export function studioReferenceVersionVerdict(
  version: unknown,
  current: number,
): StudioReferenceVerdict;
export function studioReferenceEvidence(
  ref: StudioOutputRef,
  evidence: StudioReferenceFileEvidence | undefined,
): StudioReferenceVerdict;
export function studioReferenceResolve(params: {
  ref: unknown;
  context: StudioReferenceContext;
  evidence?: StudioReferenceFileEvidence;
}): StudioReferenceVerdict;
export interface StudioWorkflowOutcomeView {
  status: string;
  text?: string;
  outputs?: StudioOutputRef[];
  version?: number;
}
export interface StudioWorkflowReferenceHost {
  runId: string;
  stepOwners?: readonly string[];
  workspaceIdentity?: string;
  fileVersion?(runId: string, stepId: string, relativePath: string): Promise<string | null>;
  /**
   * 经 CreationService 核对创作引用的归属、存在性与版本/哈希。
   * 返回 `null` 表示宿主无法核对（视同不可用）；不实现时创作引用失败关闭。
   */
  creationOutputVersion?(
    jobId: string,
    outputId: string,
  ): Promise<{ exists: boolean; sha256: string | null; path?: string } | null>;
}
export const STUDIO_REFERENCE_PLACEHOLDER = /\{\{ref\.([^{}]+)\}\}/g;
export type StudioResolvedReferenceInput =
  | {
      kind: "workspace-file";
      name: string;
      sourceRunId: string;
      sourceStepId: string;
      relativePath: string;
      sha256?: string;
    }
  | {
      kind: "creation-output";
      name: string;
      /** 目标工作区内的固定落点（与 `studioReferenceText` 给下游的路径一致）。 */
      targetPath: string;
      sourcePath: string;
      sha256: string;
    };
export interface StudioWorkflowBindings {
  values: Map<string, string>;
  files: StudioResolvedReferenceInput[];
}
export function studioRequestedOutputs(sources: Array<string | undefined>): string[];
export async function resolveStudioWorkflowBindings(params: {
  sources: Array<string | undefined>;
  outcomes: ReadonlyMap<string, StudioWorkflowOutcomeView>;
  ancestors?: ReadonlySet<string>;
  host?: StudioWorkflowReferenceHost;
}): Promise<StudioWorkflowBindings>;
```

### `packages/services/src/studio-runtime/domain/referencePath.ts`

导出 4 项（运行时 3 / 纯类型 1），分类 `original`。签名逐字取自源码。

```ts
export type StudioReferenceReason =
  /** 结构非法（缺字段、类型不对、超长）。 */
  | "malformed"
  /** 绝对路径或盘符：无法限定在本次运行的工作区里。 */
  | "absolute-path"
  /** `..`、空段或 `.` 段：试图离开声明的范围。 */
  | "traversal"
  /** ADS、反斜杠、尾随点/空格、保留设备名：会别名到另一个文件。 */
  | "dangerous-name"
  /** 引用的工作区身份与当前运行不一致。 */
  | "workspace-mismatch"
  /** 引用属于另一个运行。 */
  | "foreign-task"
  /** 引用由非前置（后继、旁支或未知）步骤产出。 */
  | "foreign-step"
  /** 引用超出了当前节点可见的范围。 */
  | "scope"
  /** 目标不存在。 */
  | "missing"
  /** 目标存在但版本已变化。 */
  | "changed"
  /** 引用契约版本高于本进程。 */
  | "unsupported-version";
export function studioReferenceIdentity(
  workspaceIdentity?: string | null,
  workspacePath?: string | null,
): string;
export function studioReferencePathReason(value: unknown): StudioReferenceReason | undefined;
export function studioReferencePathDetail(reason: StudioReferenceReason, value: string): string;
```

### `packages/services/src/studio-runtime/domain/stepReference.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function studioStepReference(result: StudioStepResult | undefined): string;
```

### `packages/services/src/studio-runtime/domain/condition.ts`

导出 4 项（运行时 3 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface StudioConditionScope {
  input: string;
  output: string;
  nodes: Readonly<Record<string, string>>;
}
export function parseStudioCondition(source: string): Condition;
export function studioConditionReferences(source: string): string[];
export function evaluateStudioCondition(source: string, scope: StudioConditionScope): boolean;
```

## 输出与产物（output\*，2 件）

### `packages/services/src/studio-runtime/domain/outputRef.ts`

导出 22 项（运行时 16 / 纯类型 6），分类 `original`。签名逐字取自源码。

```ts
export const STUDIO_OUTPUT_REF_VERSION = 1;
export const STUDIO_OUTPUT_REF_LEGACY_VERSION = 0;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type StudioOutputRef =
  | { kind: "text"; name: string; text: string }
  | { kind: "json"; name: string; schemaId?: string; value: JsonValue }
  | {
      kind: "workspace-file";
      name: string;
      runId: string;
      stepId: string;
      relativePath: string;
      sha256?: string;
    }
  | {
      kind: "creation-output";
      name: string;
      /** 产出该成果的运行 id：解析侧据此判定归属（创作任务记录本身不带运行来源）。 */
      runId: string;
      creationJobId: string;
      outputId: string;
      /**
       * 成果文件名（含扩展名）。下游拿不到创作存储的绝对路径，因此交接时按这个名字
       * 复制进目标工作区的固定落点（见 `studioCreationInputPath`）。
       */
      fileName: string;
      sha256?: string;
    };
export type StudioOutputRefStatus = "legacy" | "ok" | "unsupported";
export interface StudioOutputRefsDecodeResult {
  status: StudioOutputRefStatus;
  version: number;
  refs?: StudioOutputRef[];
  /** 版本高于 CURRENT 时按原始形状保留，供原样回写；绝不降级重写。 */
  raw?: unknown;
}
export type StudioOutputRefErrorCode = "malformed" | "tooLarge" | "unsupported";
export class StudioOutputRefError extends Error { … }
export class StudioUnsupportedCheckpointVersionError extends StudioOutputRefError { … }
export function isStudioOutputName(value: unknown): value is string;
export function isStudioOutputId(value: unknown): value is string;
export function isStudioOutputFileName(value: unknown): value is string;
export function studioCreationInputPath(fileName: string): string;
export function isJsonValue(value: unknown): value is JsonValue;
export function studioJsonBytes(value: JsonValue): number;
export function isStudioOutputRelativePath(value: unknown): value is string;
export function assertStudioOutputRefs(refs: unknown): StudioOutputRef[];
export function assertStudioOutputsForResult(result: {
  outputs?: unknown;
  resultKnown?: unknown;
}): StudioOutputRef[] | undefined;
export function decodeStudioOutputRefs(value: unknown): StudioOutputRefsDecodeResult;
export function isStudioOutputRefs(value: unknown): value is StudioOutputRef[];
export type StudioStepOutputsVerdict =
  | { kind: "legacy" }
  | { kind: "ok"; refs: StudioOutputRef[] | undefined }
  | { kind: "unsupported"; version: number; raw: unknown };
export function decodeStepOutputs(value: unknown): StudioStepOutputsVerdict;
```

### `packages/services/src/studio-runtime/domain/outputBuild.ts`

导出 3 项（运行时 2 / 纯类型 1），分类 `original`。签名逐字取自源码。

```ts
export type StudioBuiltOutput =
  | { kind: "ref"; ref: StudioOutputRef }
  | { kind: "file"; name: string; relativePath: string };
export function buildStudioStepOutputs(input: {
  names: readonly string[];
  sources?: ReadonlyMap<string, string>;
  text: string;
}): { ok: true; outputs: StudioBuiltOutput[] } | { ok: false; error: string };
export function buildStudioCreationOutputs(input: {
  names: readonly string[];
  runId: string;
  jobId: string;
  outputs: ReadonlyArray<{ id: string; fileName: string; hash?: string }>;
}): { ok: true; refs: StudioOutputRef[] } | { ok: false; error: string };
```

## 群聊与工具策略（group*/agentTool*，3 件）

### `packages/services/src/studio-runtime/domain/groupPolicy.ts`

导出 8 项（运行时 5 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export const STUDIO_GROUP_LIMITS = {
  tasksPerRound: 8,
  hostResponses: 2,
  contextChars: 48_000,
  outputChars: 24_000,
} as const;
export interface StudioGroupTask {
  id: string;
  member: StudioKernelId;
  instruction: string;
  dependsOn: string[];
}
export interface StudioGroupPlan {
  tasks: StudioGroupTask[];
}
export type StudioGroupReview =
  | { status: "complete"; summary: string }
  | { status: "revise"; summary: string; tasks: StudioGroupTask[] };
export function validateStudioGroup(group: StudioGroupDefinition): string[];
export function routeStudioGroupMembers(
  group: StudioGroupDefinition,
  input: string,
): StudioKernelId[];
export function parseStudioGroupPlan(text: string, group: StudioGroupDefinition): StudioGroupPlan;
export function parseStudioGroupReview(
  text: string,
  group: StudioGroupDefinition,
): StudioGroupReview;
```

### `packages/services/src/studio-runtime/domain/groupPrompts.ts`

导出 7 项（运行时 7 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function studioGroupContext(group: StudioGroupDefinition, history: string): string;
export function studioGroupManualPrompt(context: string, input: string): string;
export function studioGroupPlanPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
): string;
export function studioGroupTaskPrompt(
  context: string,
  input: string,
  task: StudioGroupTask,
  dependencies: Record<string, string>,
): string;
export function studioGroupReviewPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
  results: Record<string, unknown>,
  round: number,
): string;
export function studioGroupSteeredInput(input: string, summary?: string): string;
export function studioGroupSteeringPrompt(
  group: StudioGroupDefinition,
  context: string,
  input: string,
  summary: string,
  messages: Array<{ id: string; text: string }>,
  tasks: StudioGroupTask[],
  results: Record<string, unknown>,
): string;
```

### `packages/services/src/studio-runtime/domain/agentToolPolicy.ts`

导出 9 项（运行时 8 / 纯类型 1），分类 `original`。签名逐字取自源码。

```ts
export const DEFAULT_STUDIO_AGENT_POLICY: Readonly<StudioAgentPolicy> = …;
export function studioAgentPolicy(input?: Partial<StudioAgentPolicy>): StudioAgentPolicy;
export function studioAgentState(run: StudioRun): StudioAgentTaskState;
export function studioAgentTaskState(runs: StudioRun[], current: StudioRun): StudioAgentTaskState;
export function studioAgentArtifactReferences(
  changes: StudioWorkspaceChange[],
  runId: string,
  stepId: string,
): StudioAgentArtifactRef[];
export const studioAgentToolSchemas = …;
export type StudioAgentToolName = keyof typeof studioAgentToolSchemas;
export const studioAgentToolOutputSchemas = …;
export const studioAgentToolDescriptions: Record<StudioAgentToolName, string> = …;
```

## 工作区运行时与图像（workspace*/image*，5 件）

### `packages/services/src/studio-runtime/domain/workspaceRuntime.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export class WorkspaceRuntimeFault extends Error { … }
export function validateWorkspaceRuntimeControl(control: StudioWorkspaceRuntimeControl): void;
export function workspaceRuntimeCommand(
  command: StudioWorkspaceRuntimeCommand,
  port?: number,
): StudioWorkspaceRuntimeCommand;
```

### `packages/services/src/studio-runtime/domain/workspaceRuntimeEnvironment.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function workspaceRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  platform: "win32" | "posix",
  port?: number,
): Record<string, string>;
```

### `packages/services/src/studio-runtime/domain/workspaceReviewPolicy.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function validateWorkspaceReviewCommand(command: StudioReviewCommand): void;
export function validateReviewAnchor(anchor: StudioReviewAnchor): void;
export function reviewAnchorContext(
  anchor: StudioReviewAnchor,
  changes: StudioWorkspaceChange[],
): string;
export function reviewFeedbackSummary(comments: StudioReviewComment[]): string;
```

### `packages/services/src/studio-runtime/domain/workspaceImage.ts`

导出 9 项（运行时 9 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export const STUDIO_IMAGE_PREVIEW_BYTES = 25 * 1024 * 1024;
export const STUDIO_IMAGE_PREVIEW_MAX_PIXELS = 48_000_000;
export const STUDIO_IMAGE_PREVIEW_MAX_DIMENSION = 16_384;
export const studioImagePath = (path: string) => /\.(png|jpe?g)$/i.test(path);
export function sameImageVersion(a: StudioReviewFileVersion, b: StudioReviewFileVersion);
export function validateImageRequest(request: StudioWorkspaceImageRequest);
export function validateReviewedVersions(paths: string[], versions?: StudioWorkspaceImageRequest[]);
export function workspaceImageFormat(path: string, bytes: Uint8Array): Format;
export function workspaceJpegDimensions(bytes: Uint8Array);
```

### `packages/services/src/studio-runtime/domain/imageInput.ts`

导出 6 项（运行时 6 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function studioImageRef(input: StudioImageInput): StudioImageRef;
export function validateStudioImageRefs(images: readonly StudioImageRef[]): void;
export function validateStudioImageInputs(images: readonly StudioImageInput[]): void;
export function validateStudioImageDimensions(width: number, height: number): void;
export function studioImageDimensions(
  bytes: Uint8Array,
  mime: StudioImageRef["mimeType"],
): { width: number; height: number };
export function requireStudioImageModel(
  options: StudioKernelOptions | undefined,
  selected?: string,
): string;
```

## 校验与规范化（validation / canonicalValue / staticPng，3 件）

### `packages/services/src/studio-runtime/domain/validation.ts`

导出 10 项（运行时 10 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export { STUDIO_KERNEL_IDS } from "./kernelIdentity.js";
export const activeRunStates = new Set(["queued", "running", "waiting"]);
export function validStudioId(value: unknown): asserts value is string;
export function validWorkspace(path: unknown): asserts path is string;
export function validKernel(kernel: unknown): asserts kernel is StudioKernelId;
export function validActiveKernel(kernel: unknown): asserts kernel is StudioKernelId;
export function validModel(model: unknown): asserts model is string;
export function validateStudioKernelManagement(params: { kernel: unknown; action: unknown }): void;
export function validConfig(config: StudioKernelConfig): void;
export function validateStudioCommand(command: StudioCommand): void;
```

### `packages/services/src/studio-runtime/domain/canonicalValue.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function canonicalStudioValue(value: unknown): string;
```

### `packages/services/src/studio-runtime/domain/staticPng.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function validateStaticPng(bytes: Uint8Array): void;
```

## 身份与权限（projectIdentity / remoteAgentIdentity / acpPermission / workspaceSecrets / retiredKernels / attentionVersion，6 件）

### `packages/services/src/studio-runtime/domain/projectIdentity.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function studioProjectKey(path: string): string;
```

### `packages/services/src/studio-runtime/domain/remoteAgentIdentity.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function parseRemoteStudioKernelId(
  value: unknown,
): { workspaceKey: string; kernel: LocalStudioKernelId } | null;
```

### `packages/services/src/studio-runtime/domain/acpPermission.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function acpPermissionOptionId(
  options: Array<Record<string, unknown>>,
  decision: string | undefined,
): unknown;
```

### `packages/services/src/studio-runtime/domain/workspaceSecrets.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `original`。签名逐字取自源码。

```ts
export function studioWorkspaceSecretPath(path: string): boolean;
```

### `packages/services/src/studio-runtime/domain/retiredKernels.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function assertTargetKernelsActive(
  kind: "chat" | "group" | "workflow",
  definition: StudioConversation | StudioGroupDefinition | StudioWorkflowDefinition,
): void;
```

### `packages/services/src/studio-runtime/domain/attentionVersion.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function studioAttentionVersion(run: StudioRun, interaction?: StudioInteraction): string;
```

## 能力矩阵（capabilityMatrix，1 件）

### `packages/services/src/studio-runtime/domain/capabilityMatrix.ts`

导出 11 项（运行时 6 / 纯类型 5），分类 `original`。签名逐字取自源码。

```ts
export interface StudioCapabilitySet {
  resume: boolean;
  approval: boolean;
  questions: boolean;
  readOnly: boolean;
  fullAccess: boolean;
}
export type StudioCapabilityId = keyof StudioCapabilitySet;
export const STUDIO_CAPABILITY_IDS = …;
export type StudioCapabilityEvidence =
  /** 命中版本化的已核验行。 */
  | "verified"
  /** 版本未知时适配器自身的既有声明（与今天线上行为一致）。 */
  | "declared"
  /** 探测期原生协议声明（ACP initialize 的 resume）。 */
  | "advertised"
  /** Studio 适配器自身实现（ACP 握手后的审批通道）。 */
  | "adapter"
  /** 明确不支持。 */
  | "unsupported"
  /** 版本已知但不在已核验范围内：失败关闭。 */
  | "unverified"
  /** 用户显式授权的例外，只能由调用方传入，永不自动产生。 */
  | "user-exception";
export interface StudioCapabilityDecision {
  supported: boolean;
  evidence: StudioCapabilityEvidence;
  /** 证据来源，例如 `acp-initialize`；非外部声明时为 undefined。 */
  source?: string;
}
export interface StudioCapabilityAssessment {
  kernel: string;
  version?: string;
  matrixVersion: string;
  capabilities: StudioCapabilitySet;
  decisions: Record<StudioCapabilityId, StudioCapabilityDecision>;
}
export const STUDIO_CAPABILITY_MATRIX_VERSION = "knorvia-capability-matrix/1";
export function versionSatisfies(version: string, range: string): boolean;
export function assessKernelCapabilities(input: {
  kernel: string;
  version?: string;
  exception?: { capability: StudioCapabilityId; reason?: string };
}): StudioCapabilityAssessment;
export function capabilityAdvertisable(evidence: StudioCapabilityEvidence): boolean;
export function mergeAdvertisedCapabilities(
  assessment: StudioCapabilityAssessment,
  advertised: Partial<StudioCapabilitySet>,
  source: string,
): StudioCapabilityAssessment;
```
