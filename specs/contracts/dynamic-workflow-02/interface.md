# dynamic-workflow-02 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

机器生成：`node --import tsx specs/contracts/dynamic-workflow-02/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs`）。**不要手改**；手改会在下一次生成时被覆盖，而 B20 的 oracle 就是本文件的导出声明块。

覆盖范围：`apps/cli/packages/dynamic-workflow/src/` 下 **analysis/ 与 compiler/ 之外**的全部 40 个 .ts（那是 dynamic-workflow-01 的范围），共 537 项顶层导出。分类构成见 `README.md`。

## 兼容入口面（重写后必须原样可用）

- **根桶 `@knorvia/dynamic-workflow`（`src/index.ts` / `dist/index.js`）是本包唯一的运行时公开面**。包外 56 个调用文件全部只经这两个桶取符号（85 个具名导入，见 `callers-raw.txt` 第一段）：`WorkflowEngine`、`InMemoryJournalStore`、`WorkflowError`、`ConcurrencyController` 与五个上限常量、`canonicalJson`/`fnv1a`/`inputHash`/`refToString`、facade 的 `FACADE_DTS`/`SNIPPET_FACADE_DTS`/`FACADE_FILE_NAME`/三族 caps/`ARTIFACT_ID_PATTERN`/`ARTIFACT_REGISTRY`/`artifactFamilyOf`/`isArtifactPresetOp`、lowering 的 `HOST_BINDING`/`lowerWorkflow`/`lowerWorkflowScript`、schema 的 `validate`/`formatViolation`/`formatViolations`/`serializeSchema`/`buildAskSpecs`/`synthesizeAskSchemas`/`synthesizeWorkflowSchemas`/`deriveActorSubmitProfiles`/`deriveActorSubmitProfilesFor`/`GENERIC_SUBMIT_PROFILE`/`MAX_UNION_MEMBERS`/`SCHEMA_DIAGNOSTIC_CODE`，以及全部类型导出。
- **`@knorvia/dynamic-workflow/projections`（`src/projections.ts` / `dist/projections.js`）是浏览器安全子集**：整体只再导出 analysis 投影（dynamic-workflow-01 的范围），**不得**引入 `typescript` 运行时依赖（`core/src/tool/handlers/create-workflow-graph-bounds.ts` 与 `-fold.ts` 走这个子路径正是为了不把编译器拖进浏览器包）。本包对该文件的合同只有这一条不变式 + 导出集合本身。
- **深层模块路径**（包内 import 方按相对路径引用，重写后必须原样存在）：
  - `facade/dts.js`（`FACADE_DTS`、`FACADE_FILE_NAME`）← `compiler/compile.ts`、`analysis/facade-misuse.ts`、`analysis/sites-labels.ts`、`analysis/sites.ts`；
  - `facade/registry.js`（`WorldReadOp`/`ArtifactOp` 类型、`worldReadOpOfSymbol`、`artifactRowOfSymbol`、`siteProducingFunctionOfSymbol`、`markerFunctionOfSymbol`、`isSiteProducing`、`facadeContainerOf`、`SITE_MEMBER_NAMES`、`isArtifactPresetOp`）← `analysis/sites.ts`、`analysis/facade-misuse.ts`、`analysis/artifacts.ts`、`engine/engine-artifacts.ts`；
  - `facade/artifact-caps.js`（`ARTIFACT_CAPS`、`ARTIFACT_ID_PATTERN`）← `analysis/artifacts.ts`；
  - `engine/scheduler.js`（`AskScheduler`、`hashMismatch`）、`engine/scheduler-types.js`（`SchedulerHost`、`defer`）、`engine/journal-memory.js`、`engine/hash.js`、`engine/imported-cache.js`（`ImportedActorState`）、`engine/types.js` ← 本包 `test/ask-scheduler-contract.test.ts` 与 `test/ask-scheduler-fixture.ts`。
- 因此**只有 facade 的三个文件与 engine 的内部模块存在包外/测试侧的深路径依赖**；`engine/engine*.ts`、`lowering/*`、`schema/*` 的对外身份只经根桶。内部怎么拆文件由重写方决定，但 interface.md 列出的模块路径与导出名都要在产物里可用。

## 不在兼容面上的东西

- `analysis/*.ts` 与 `compiler/compile.ts` 的导出面、行为、诊断码归 dynamic-workflow-01（已合并），本合同只把它们当**输入**（`createWorkflowProgram`/`collectSites`/`collectDiagnostics` 是合成与 lowering 的前置）。
- `compiler/libs.generated.ts` 与 `facade/*.d.ts` 资产是 `scripts/generate-libs.mjs` 的构建期生成物（不进 git）。
- `AskScheduler`、`ImportedActorState`、`boundWorldReadInput`、`validateArtifactSpec`、`publishReport` 等是**包内接缝**：它们没有独立的兼容承诺，行为由公开面（`WorkflowEngine` 的事件序列与 journal 行）判定，见 `behavior.md` 各条。

## 逐文件导出（共 40 文件 / 537 项）

## 入口桶（包的公开面）（2 个文件）

### `apps/cli/packages/dynamic-workflow/src/index.ts`

导出 200 项（运行时 194 / 纯类型 6），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export { FACADE_DTS } from "./facade/dts.js";
export { FACADE_FILE_NAME } from "./facade/dts.js";
export { SNIPPET_FACADE_DTS } from "./facade/dts.js";
export { WORLD_READ_CAPS } from "./facade/world-read-caps.js";
export { REPORT_CAPS } from "./facade/report-caps.js";
export { ARTIFACT_CAPS } from "./facade/artifact-caps.js";
export { ARTIFACT_ID_PATTERN } from "./facade/artifact-caps.js";
export { ARTIFACT_REGISTRY } from "./facade/registry.js";
export { artifactFamilyOf } from "./facade/registry.js";
export { isArtifactPresetOp } from "./facade/registry.js";
export { ArtifactContentOp } from "./facade/registry.js";
export { ArtifactOp } from "./facade/registry.js";
export { ArtifactPresetOp } from "./facade/registry.js";
export { ArtifactRow } from "./facade/registry.js";
export { ARTIFACT_DECLARATION_CODE } from "./analysis/artifacts.js";
export { ARTIFACT_HOISTING_CODE } from "./analysis/artifacts.js";
export { ARTIFACT_PRIMARY_CONFLICT_CODE } from "./analysis/artifacts.js";
export { collectArtifactDeclarations } from "./analysis/artifacts.js";
export { ArtifactDeclarations } from "./analysis/artifacts.js";
export { DeclaredArtifact } from "./analysis/artifacts.js";
export { collectDiagnostics } from "./compiler/compile.js";
export { compileWorkflowScript } from "./compiler/compile.js";
export { createWorkflowProgram } from "./compiler/compile.js";
export { SCRIPT_FILE_NAME } from "./compiler/compile.js";
export { CompileDiagnostic } from "./compiler/compile.js";
export { CompileResult } from "./compiler/compile.js";
export { CreateWorkflowProgramOptions } from "./compiler/compile.js";
export { ScriptLoc } from "./compiler/compile.js";
export { WorkflowProgram } from "./compiler/compile.js";
export { analyzeWorkflowScript } from "./analysis/analyze.js";
export { AnalyzeResult } from "./analysis/analyze.js";
export { collectSites } from "./analysis/sites.js";
export { SiteTable } from "./analysis/sites.js";
export { collectWorldRunCommands } from "./analysis/world-run.js";
export { WORLD_RUN_LITERAL_CODE } from "./analysis/world-run.js";
export { WorldRunCommands } from "./analysis/world-run.js";
export { collectPhaseMarkerDiagnostics } from "./analysis/phases.js";
export { PHASE_MARKER_CODE } from "./analysis/phases.js";
export { toActorGraph } from "./analysis/actor-graph.js";
export { ActorEdge } from "./analysis/actor-graph.js";
export { ActorGraph } from "./analysis/actor-graph.js";
export { ActorNode } from "./analysis/actor-graph.js";
export { SINK_ID } from "./analysis/causality-graph.js";
export { UNKNOWN_LANE } from "./analysis/causality-graph.js";
export { WORKSPACE_LANE } from "./analysis/causality-graph.js";
export { CausalityGraph } from "./analysis/causality-graph.js";
export { Certainty } from "./analysis/causality-graph.js";
export { Lane } from "./analysis/causality-graph.js";
export { NamePattern } from "./analysis/causality-graph.js";
export { OrderEdge } from "./analysis/causality-graph.js";
export { OrderKind } from "./analysis/causality-graph.js";
export { Phase } from "./analysis/causality-graph.js";
export { Region } from "./analysis/causality-graph.js";
export { RegionKind } from "./analysis/causality-graph.js";
export { Step } from "./analysis/causality-graph.js";
export { StepKind } from "./analysis/causality-graph.js";
export { reduceOrdering } from "./analysis/causality-reduce.js";
export { ReducibleEdge } from "./analysis/causality-reduce.js";
export { UNPHASED_ID } from "./analysis/causality-order.js";
export { JumpKind } from "./analysis/causality-order.js";
export { StructuralRegionKind } from "./analysis/causality-order.js";
export { TraceRegionKind } from "./analysis/causality-order.js";
export { FLOW_ABORT } from "./analysis/flow-graph.js";
export { FLOW_ENTRY } from "./analysis/flow-graph.js";
export { FLOW_SINK } from "./analysis/flow-graph.js";
export { projectControlFlow } from "./analysis/flow-graph.js";
export { ControlFlowGraph } from "./analysis/flow-graph.js";
export { FlowEdge } from "./analysis/flow-graph.js";
export { FlowEdgeKind } from "./analysis/flow-graph.js";
export { FlowNode } from "./analysis/flow-graph.js";
export { FlowNodeKind } from "./analysis/flow-graph.js";
export { FlowPhase } from "./analysis/flow-graph.js";
export { FlowVia } from "./analysis/flow-graph.js";
export { actorGraphToMermaid } from "./analysis/mermaid.js";
export { causalityGraphToMermaid } from "./analysis/mermaid.js";
export { controlFlowToMermaid } from "./analysis/mermaid.js";
export { handoffGraphToMermaid } from "./analysis/mermaid.js";
export { phaseFlowToMermaid } from "./analysis/mermaid.js";
export { phaseGraphToMermaid } from "./analysis/mermaid.js";
export { siteGraphToMermaid } from "./analysis/mermaid.js";
export { serializeCausalityGraph } from "./analysis/serialize.js";
export { serializeControlFlow } from "./analysis/serialize.js";
export { serializeHandoffGraph } from "./analysis/serialize.js";
export { FANOUT_EXPAND_CAP } from "./analysis/handoff-graph.js";
export { projectHandoffGraph } from "./analysis/handoff-graph.js";
export { UNPHASED } from "./analysis/handoff-graph.js";
export { Handoff } from "./analysis/handoff-graph.js";
export { HandoffGraph } from "./analysis/handoff-graph.js";
export { HandoffParticipant } from "./analysis/handoff-graph.js";
export { serializeCore } from "./analysis/core.js";
export { AnalysisCore } from "./analysis/core.js";
export { CoreActorSite } from "./analysis/core.js";
export { CoreAskSite } from "./analysis/core.js";
export { CoreFacts } from "./analysis/core.js";
export { CoreFanoutSite } from "./analysis/core.js";
export { CoreSimpleSite } from "./analysis/core.js";
export { CoreSites } from "./analysis/core.js";
export { CoreTypes } from "./analysis/core.js";
export { decodeAnalysisCore } from "./analysis/core-json.js";
export { encodeAnalysisCore } from "./analysis/core-json.js";
export { AnalysisCoreJson } from "./analysis/core-json.js";
export type { ActorSite } from "./analysis/types.js";
export type { SiteEdge } from "./analysis/types.js";
export type { SiteGraph } from "./analysis/types.js";
export type { SiteKind } from "./analysis/types.js";
export type { SiteLoc } from "./analysis/types.js";
export type { SiteNode } from "./analysis/types.js";
export { buildAskSpecs } from "./schema/synthesize.js";
export { synthesizeAskSchemas } from "./schema/synthesize.js";
export { synthesizeWorkflowSchemas } from "./schema/synthesize.js";
export { SchemaSynthesisResult } from "./schema/synthesize.js";
export { validate } from "./schema/validate.js";
export { formatViolation } from "./schema/validate.js";
export { formatViolations } from "./schema/validate.js";
export { GENERIC_SUBMIT_PROFILE } from "./schema/actor-submit-profiles.js";
export { deriveActorSubmitProfiles } from "./schema/actor-submit-profiles.js";
export { deriveActorSubmitProfilesFor } from "./schema/actor-submit-profiles.js";
export { ActorSubmitProfile } from "./schema/actor-submit-profiles.js";
export { serializeSchema } from "./schema/serialize.js";
export { MAX_UNION_MEMBERS } from "./schema/types.js";
export { SCHEMA_DIAGNOSTIC_CODE } from "./schema/types.js";
export { JsonSchema } from "./schema/types.js";
export { JsonSchemaType } from "./schema/types.js";
export { JsonValue } from "./schema/types.js";
export { Violation } from "./schema/types.js";
export { HOST_BINDING } from "./lowering/index.js";
export { lowerWorkflow } from "./lowering/index.js";
export { lowerWorkflowScript } from "./lowering/index.js";
export { LoweredWorkflow } from "./lowering/index.js";
export { LowerResult } from "./lowering/index.js";
export { WorkflowEngine } from "./engine/index.js";
export { InMemoryJournalStore } from "./engine/index.js";
export { WorkflowError } from "./engine/index.js";
export { INSTRUCTIONS_HEAD_MAX_CHARS } from "./engine/index.js";
export { LAST_TOOL_NAME_MAX_CHARS } from "./engine/index.js";
export { LAST_TOOL_TARGET_MAX_CHARS } from "./engine/index.js";
export { NUDGE_ATTEMPTS } from "./engine/index.js";
export { REPAIR_ATTEMPTS } from "./engine/index.js";
export { canonicalJson } from "./engine/index.js";
export { fnv1a } from "./engine/index.js";
export { inputHash } from "./engine/index.js";
export { refToString } from "./engine/index.js";
export { ActorId } from "./engine/index.js";
export { ActorRecord } from "./engine/index.js";
export { ActorRef } from "./engine/index.js";
export { ActorSessionSeed } from "./engine/index.js";
export { ArtifactPublishRequest } from "./engine/index.js";
export { ArtifactRef } from "./engine/index.js";
export { ArtifactVersionRecord } from "./engine/index.js";
export { AskMessage } from "./engine/index.js";
export { AskLastTool } from "./engine/index.js";
export { AskProgress } from "./engine/index.js";
export { AskSpec } from "./engine/index.js";
export { AskStats } from "./engine/index.js";
export { Caps } from "./engine/index.js";
export { EngineConfig } from "./engine/index.js";
export { ImportedActorCandidate } from "./engine/index.js";
export { ImportedAskEntry } from "./engine/index.js";
export { ImportedRunCache } from "./engine/index.js";
export { ImportedWorldEntry } from "./engine/index.js";
export { InstanceRef } from "./engine/index.js";
export { JournalStorePort } from "./engine/index.js";
export { ListEventsOptions } from "./engine/index.js";
export { NodeKind } from "./engine/index.js";
export { NodeOutcome } from "./engine/index.js";
export { NodeRecord } from "./engine/index.js";
export { NodeRecordStatus } from "./engine/index.js";
export { WorldReadInput } from "./engine/index.js";
export { WORLD_READ_INPUT_MAX_BYTES } from "./engine/index.js";
export { PersonaSpec } from "./engine/index.js";
export { RunEvent } from "./engine/index.js";
export { RunRecord } from "./engine/index.js";
export { RunSettlement } from "./engine/index.js";
export { RunSettlementRecord } from "./engine/index.js";
export { RunStallInfo } from "./engine/index.js";
export { RunStatus } from "./engine/index.js";
export { RunStopReason } from "./engine/index.js";
export { SessionRef } from "./engine/index.js";
export { StoredEvent } from "./engine/index.js";
export { SubmitVerdict } from "./engine/index.js";
export { ValidateFn } from "./engine/index.js";
export { WorkflowDriver } from "./engine/index.js";
export { WorkflowErrorCode } from "./engine/index.js";
export { WorkflowErrorJson } from "./engine/index.js";
export { ProviderStopDetails } from "./engine/index.js";
export { WorkflowErrorMismatch } from "./engine/index.js";
export { WorkflowHostApi } from "./engine/index.js";
export { WorkflowReportSink } from "./engine/index.js";
export { WorldReadOp } from "./engine/index.js";
export { AskWaitInfo } from "./engine/index.js";
export { ConcurrencyChange } from "./engine/index.js";
export { ConcurrencyChangeReason } from "./engine/index.js";
export { ConcurrencyController } from "./engine/index.js";
export { CONCURRENCY_DECREASE_FACTOR } from "./engine/index.js";
export { CONCURRENCY_FLOOR } from "./engine/index.js";
export { CONCURRENCY_IDLE_RESET_MS } from "./engine/index.js";
export { CONCURRENCY_INCREASE_AFTER_SUCCESSES } from "./engine/index.js";
export { CONCURRENCY_INCREASE_STEP } from "./engine/index.js";
export { ConcurrencyControllerSnapshot } from "./engine/index.js";
export { ConcurrencyThrottleReason } from "./engine/index.js";
```

### `apps/cli/packages/dynamic-workflow/src/projections.ts`

导出 86 项（运行时 70 / 纯类型 16），分类 `upstream-modified`。签名逐字取自源码。

```ts
export { isActorSite } from "./analysis/core.js";
export { serializeCore } from "./analysis/core.js";
export { AnalysisCore } from "./analysis/core.js";
export { CoreActorSite } from "./analysis/core.js";
export { CoreAskSite } from "./analysis/core.js";
export { CoreFacts } from "./analysis/core.js";
export { CoreFanoutSite } from "./analysis/core.js";
export { CoreSimpleSite } from "./analysis/core.js";
export { CoreSites } from "./analysis/core.js";
export { CoreTypes } from "./analysis/core.js";
export { decodeAnalysisCore } from "./analysis/core-json.js";
export { encodeAnalysisCore } from "./analysis/core-json.js";
export { AnalysisCoreJson } from "./analysis/core-json.js";
export { MapEntries } from "./analysis/core-json.js";
export type { ActorEvent } from "./analysis/causality-order.js";
export type { ControlFact } from "./analysis/causality-order.js";
export type { IssueEvent } from "./analysis/causality-order.js";
export type { JumpEvent } from "./analysis/causality-order.js";
export type { MarkEvent } from "./analysis/causality-order.js";
export type { OrderEvent } from "./analysis/causality-order.js";
export type { OrderRegion } from "./analysis/causality-order.js";
export type { OrderTrace } from "./analysis/causality-order.js";
export type { PhaseInfo } from "./analysis/causality-order.js";
export type { SettleEvent } from "./analysis/causality-order.js";
export { isStructuralRegionKind } from "./analysis/constants.js";
export { UNPHASED_ID } from "./analysis/constants.js";
export { JumpKind } from "./analysis/constants.js";
export { RegionKind } from "./analysis/constants.js";
export { StructuralRegionKind } from "./analysis/constants.js";
export { TraceRegionKind } from "./analysis/constants.js";
export { projectSiteGraph } from "./analysis/graph.js";
export { toActorGraph } from "./analysis/actor-graph.js";
export { ActorEdge } from "./analysis/actor-graph.js";
export { ActorGraph } from "./analysis/actor-graph.js";
export { ActorNode } from "./analysis/actor-graph.js";
export { projectCausalityGraph } from "./analysis/causality-graph.js";
export { SINK_ID } from "./analysis/causality-graph.js";
export { UNKNOWN_LANE } from "./analysis/causality-graph.js";
export { WORKSPACE_LANE } from "./analysis/causality-graph.js";
export { CausalityGraph } from "./analysis/causality-graph.js";
export { Certainty } from "./analysis/causality-graph.js";
export { Lane } from "./analysis/causality-graph.js";
export { NamePattern } from "./analysis/causality-graph.js";
export { OrderEdge } from "./analysis/causality-graph.js";
export { OrderKind } from "./analysis/causality-graph.js";
export { Phase } from "./analysis/causality-graph.js";
export { Region } from "./analysis/causality-graph.js";
export { Step } from "./analysis/causality-graph.js";
export { StepKind } from "./analysis/causality-graph.js";
export { reduceOrdering } from "./analysis/causality-reduce.js";
export { ReducibleEdge } from "./analysis/causality-reduce.js";
export { FLOW_ABORT } from "./analysis/flow-graph.js";
export { FLOW_ENTRY } from "./analysis/flow-graph.js";
export { FLOW_SINK } from "./analysis/flow-graph.js";
export { projectControlFlow } from "./analysis/flow-graph.js";
export { ControlFlowGraph } from "./analysis/flow-graph.js";
export { FlowEdge } from "./analysis/flow-graph.js";
export { FlowEdgeKind } from "./analysis/flow-graph.js";
export { FlowNode } from "./analysis/flow-graph.js";
export { FlowNodeKind } from "./analysis/flow-graph.js";
export { FlowPhase } from "./analysis/flow-graph.js";
export { FlowVia } from "./analysis/flow-graph.js";
export { FANOUT_EXPAND_CAP } from "./analysis/handoff-graph.js";
export { projectHandoffGraph } from "./analysis/handoff-graph.js";
export { UNPHASED } from "./analysis/handoff-graph.js";
export { Handoff } from "./analysis/handoff-graph.js";
export { HandoffGraph } from "./analysis/handoff-graph.js";
export { HandoffParticipant } from "./analysis/handoff-graph.js";
export { actorGraphToMermaid } from "./analysis/mermaid.js";
export { causalityGraphToMermaid } from "./analysis/mermaid.js";
export { controlFlowToMermaid } from "./analysis/mermaid.js";
export { handoffGraphToMermaid } from "./analysis/mermaid.js";
export { phaseFlowToMermaid } from "./analysis/mermaid.js";
export { phaseGraphToMermaid } from "./analysis/mermaid.js";
export { siteGraphToMermaid } from "./analysis/mermaid.js";
export { serializeActorGraph } from "./analysis/serialize.js";
export { serializeCausalityGraph } from "./analysis/serialize.js";
export { serializeControlFlow } from "./analysis/serialize.js";
export { serializeGraph } from "./analysis/serialize.js";
export { serializeHandoffGraph } from "./analysis/serialize.js";
export type { ActorSite } from "./analysis/types.js";
export type { SiteEdge } from "./analysis/types.js";
export type { SiteGraph } from "./analysis/types.js";
export type { SiteKind } from "./analysis/types.js";
export type { SiteLoc } from "./analysis/types.js";
export type { SiteNode } from "./analysis/types.js";
```

## 引擎（Boundary A/B/C + journal）（24 个文件）

### `apps/cli/packages/dynamic-workflow/src/engine/artifact-spec.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function validateArtifactSpec(op: ArtifactPresetOp, spec: unknown): ArtifactSpecProblem;
```

### `apps/cli/packages/dynamic-workflow/src/engine/ask-journal-projection.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function askJournalRecord(node: AskNode, outcome: JournalOutcome, runId: string): NodeRecord;
```

### `apps/cli/packages/dynamic-workflow/src/engine/ask-observation-types.ts`

导出 6 项（运行时 3 / 纯类型 3），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface AskStats {
  tokens: number;
  toolCalls: number;
  turns: number;
  /**
   * 其中**看或动了外部世界**的调用数：读文件、跑命令、访问网络。
   * 不含只把结果或问题交回引擎的协议工具（`submit_result`、`escalate`），所以一条只作答的 typed ask
   * 这里是 0——那样的 ask 是**纯**的，只依赖指令与转录前缀，导入缓存关闭之后仍可从缓存结算。
   * 老 journal 行没有这个键，一律按「碰过」处理（保守）。
   */
  worldToolCalls?: number;
}
export const INSTRUCTIONS_HEAD_MAX_CHARS = 240;
export const LAST_TOOL_NAME_MAX_CHARS = 64;
export const LAST_TOOL_TARGET_MAX_CHARS = 120;
export interface AskLastTool {
  /** 工具名，≤ {@link LAST_TOOL_NAME_MAX_CHARS}。 */
  name: string;
  /** 简短目标，≤ {@link LAST_TOOL_TARGET_MAX_CHARS}；无从判断时缺席（不合成占位串）。 */
  target?: string;
}
export interface AskProgress {
  /** 本 ask 内已解析的 turn 数，从 1 起（nudge 轮计数；repair 轮不计——它们不结束 turn）。 */
  turn: number;
  /** 本 ask 内累计的工具调用数，与 {@link AskStats.toolCalls} 同一个计数器。 */
  toolCalls: number;
  lastTool?: AskLastTool;
}
```

### `apps/cli/packages/dynamic-workflow/src/engine/concurrency.ts`

导出 8 项（运行时 6 / 纯类型 2），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const CONCURRENCY_DECREASE_FACTOR = 0.75
export const CONCURRENCY_INCREASE_STEP = 1
export const CONCURRENCY_INCREASE_AFTER_SUCCESSES = 4
export const CONCURRENCY_FLOOR = 1
export const CONCURRENCY_IDLE_RESET_MS = 300_000
export type ConcurrencyThrottleReason = Extract<
  ConcurrencyChangeReason,
  "rate_limited" | "provider_overloaded" | "offpeak_queued"
>;
export interface ConcurrencyControllerSnapshot {
  readonly key: string;
  readonly ceiling: number;
  readonly cap: number;
  /** 限流裁决计数；准入时发给请求，请求结束时带回来比对。 */
  readonly epoch: number;
  readonly inFlight: number;
  readonly waiters: number;
  readonly successStreak: number;
  readonly cooldownUntil?: number;
  readonly lastRequestAt?: number;
  readonly lastGood?: number;
  readonly lastBad?: number;
}
export class ConcurrencyController {{ … }
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-artifacts.ts`

导出 5 项（运行时 5 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function publishContentArtifact(
  state: EngineState,
  siteId: string,
  op: ArtifactContentOp,
  args: unknown[],
): Promise<ArtifactRef>;
export function declarePresetArtifact(
  state: EngineState,
  siteId: string,
  op: ArtifactPresetOp,
  args: unknown[],
): void;
export function rememberArtifactRow(
  state: EngineState,
  id: string | undefined,
  result: unknown,
): void;
export function isDeclaredPreset(state: EngineState, id: string): boolean;
export function declaredPresetIds(state: EngineState): string[];
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-launch.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface RunLaunchConfig {
  inputId: string;
  phaseNames?: string[];
  subagentModel?: string;
  /** 本 run 脚本文件的绝对路径。 */
  scriptPath?: string;
  phaseAlongside?: number[][];
}
export function runLaunchedEvent(
  launch: RunLaunchConfig,
  origin: { toolCallId?: string | undefined; parentSessionId?: string | undefined },
): RunEvent;
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-report.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function publishReport(
  state: EngineState,
  siteId: string,
  item: unknown,
  artifactId?: string,
): void;
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-settlement.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function settleCompleted(state: EngineState, artifact: unknown): void;
export function settleStopped(
  state: EngineState,
  reason: RunStopReason,
  error?: WorkflowError,
  supersededBy?: string,
): void;
export function settleFailed(state: EngineState, error: WorkflowError): void;
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-state.ts`

导出 3 项（运行时 0 / 纯类型 3），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export type RunSettlement =
  | { status: "completed"; artifact: unknown }
  | { status: "errored"; error: WorkflowError }
  | { status: "stopped"; reason: RunStopReason; supersededBy?: string; error?: WorkflowError };
export interface ArtifactIdState {
  kind: ArtifactOp;
  /** 已成功的版本数（内容成员每成功一次 +1；预置声明恒为 1）。 */
  versions: number;
  /** 预置 spec 的 canonicalJson（重复声明的幂等判定按它比对）。内容成员缺席。 */
  spec?: string;
  /** 这个 id 是 run 的交付物（primary）。全 run 至多一个 id 带它；从 completed 行重建。 */
  primary?: true;
}
export interface EngineState {
  readonly runId: string;
  readonly driver: WorkflowDriver;
  readonly journal: JournalStorePort;
  /**
   * 本 run 每个**用户面产物** id 的状态。resume 时从 journal
   * 的 `kind: "artifact"` 行重建，此后在内存里维护——上限与版本号都是 run 级事实，跨 resume 连续。
   *
   * ⚠ 术语：artifact = 用户面产物，不是 `RunSettlement.artifact`（顶层返回值）。
   */
  readonly artifacts: Map<string, ArtifactIdState>;
  /** amend-resume 的导入缓存（纯数据，缺席即本次不是修订续跑）。 */
  readonly importedCache: ImportedRunCache | undefined;
  /** world 导入队列的消费游标（第 n 次出现对第 n 条）。 */
  readonly importedWorld: ImportedWorldQueue;

  isRunSettled(): boolean;
  /** run 已结算时用于 reject / throw 的错误。 */
  runError(): WorkflowError;
  /** run 级失败（first-wins；见 engine-settlement.ts 的 settleFailed）。 */
  failRun(error: WorkflowError): void;
  /** 事件既落 journal 又扇出（Boundary C）；出生阶段在引擎的漏斗里补上。 */
  record(event: RunEvent): void;
  /** 站点序号的唯一铸造点。 */
  nextOrdinal(siteId: string): number;

  /** 本 run 已发布的报告条数（REPORT_CAPS.maxItemsPerRun 的计数器，跨 resume 连续）。 */
  reportCount(): number;
  /** 一条报告过了上限检查、即将落库：计数 +1。 */
  countReport(): void;

  /** 导入缓存是否已关闭。 */
  importClosed(): boolean;
  /** 关门（永不重开）。 */
  closeImport(): void;

  /** 置 run 为已结算；带 failure 时同时记下 run 级失败原因（供 runError 复用）。 */
  markSettled(failure?: WorkflowError): void;
  /** 中止所有在飞 ask（委托调度器）。 */
  abortInFlight(error: WorkflowError, emitCancelled: boolean): void;
  /** 兑现 `engine.settled`。 */
  resolveSettled(settlement: RunSettlement): void;
}
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine-world.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function readWorld(
  state: EngineState,
  siteId: string,
  op: WorldReadOp,
  args: unknown[],
): Promise<unknown>;
export function closeImportCache(
  state: EngineState,
  instance: InstanceRef,
  cause: "mutating-tool" | "world-run",
  actorName?: string,
): void;
export function recoverImportClosure(
  journal: JournalStorePort,
  runId: string,
): { live: ReadonlySet<string>; closed: boolean };
```

### `apps/cli/packages/dynamic-workflow/src/engine/engine.ts`

导出 3 项（运行时 1 / 纯类型 2），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface EngineConfig {
  runId: string;
  driver: WorkflowDriver;
  caps: Caps;
  /**
   * 每 ask 站点的静态规格（typed + schema）。**必须覆盖脚本里的每一个 ask 站点**——
   * 站点表与 schema 合成来自同一次编译，因此缺席只可能是接线错误，引擎按硬错误处理
   * （MissingAskSpec）。untyped 站点要显式记为 `{ typed: false }`。
   */
  askSpecs: ReadonlyMap<string, AskSpec>;
  /** 注入的 schema 校验器（核心不 import schema 实现）。 */
  validate: ValidateFn;
  /** run 元数据（落 dwf_run，仅在本次 createRun 时写入；resume 时不覆写记录）。 */
  scriptText?: string;
  /**
   * run 的展示名（`CreateWorkflow` 的可选 `input.name`）。引擎不读它，只在建 run 时随
   * `scriptText` 一起落库——宿主的枚举面据它给 run 起标签。见 {@link RunRecord.name}。
   */
  name?: string;
  /**
   * 脚本文本的哈希。resume 时与 journal 记录里的值比对：两侧都有且不同即拒绝本次 resume
   * （V1 的 resume 只对逐字节相同的脚本有效）。
   */
  scriptHash?: string;
  /**
   * 本次 run 的实参（已校验回填）。引擎不读它，只在建 run 时随 `scriptText` 一起落库；
   * 沙箱侧的注入走 harness 的 spawn payload，不经引擎。见 {@link RunRecord.args}。
   */
  args?: Record<string, unknown>;
  parentSessionId?: string;
  cwd?: string;
  /**
   * 发起 run 的 CreateWorkflow 工具调用 id（见 {@link RunRecord.toolCallId}）。
   * 引擎不读它，只随其余元数据在 createRun 时落库。
   */
  toolCallId?: string;
  /**
   * 本次 run 修订自哪个前驱 run（见 {@link RunRecord.resumedFrom}）。引擎不读它，
   * 只随其余元数据在 createRun 时落库——导入缓存的构建在 run service，不在核心。
   */
  resumedFrom?: string;
  /**
   * 发起 run 那一轮的锚点。引擎不读它，只在建 run 那一世
   * 紧跟首条 `run-started` 记一条 `run-launched`；resume 命中既有行时不再记（锚点跨生命周期唯一）。
   * `phaseNames` 随锚点同车：脚本声明的阶段表，引擎同样不读，只落 journal。`phaseAlongside`
   * 与它按位置对齐（下标指向同一张表），同车同规。
   * `subagentModel` 也同车：本 run 子代理的选型（规范 picker 串），引擎同样不读——模型面整个
   * 在宿主侧（bootstrap 的 workflow-actor-model.ts），宿主从这条事件读回它，零 SQL。
   * `scriptPath` 同车同规：本 run 的脚本来自哪个文件（绝对路径），引擎不读，宿主从这条事件
   * 读回它交给模型面。
   */
  launch?: RunLaunchConfig;
  /**
   * 建 run 时的用量起点：前驱 run 的 `spentTokens`。amend 路径给出，全新 submit 缺席（= 从零起账），
   * resume 路径给了也无用——命中既有行时用量从行里恢复。
   *
   * 语义是「本 run 报的是整条 lineage 的花费」：每个前驱的数字本身已是累计值，所以链式修订
   * 按构造求和，没人需要走 `resumed_from` 链。命中缓存不再加钱（那笔账就在这个继承值里），
   * 只有本次现跑的 live turn 往上加。
   */
  inheritedTokens?: number;
  /**
   * amend-resume 的导入缓存（{@link ImportedRunCache}）。**纯数据注入**——核心因此仍是
   * 零 I/O 的确定性状态机：读前驱 journal、走 `resumed_from` 链、解析转录源，全部发生在
   * run service，引擎只拿到一张构建好的表并按运行期身份（actor 名 + persona、
   * `{op,args}` 内容 + 出现序）比对。缺席即本次不是修订续跑。
   */
  importedCache?: ImportedRunCache;
}
export type { RunSettlement } from "./engine-state.js"
export class WorkflowEngine implements WorkflowHostApi, WorkflowReportSink {{ … }
```

### `apps/cli/packages/dynamic-workflow/src/engine/hash.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function canonicalJson(value: unknown): string;
export function fnv1a(input: string): string;
export function inputHash(value: unknown): string;
```

### `apps/cli/packages/dynamic-workflow/src/engine/imported-cache-types.ts`

导出 4 项（运行时 0 / 纯类型 4），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface ImportedAskEntry {
  /** 前驱记录的 inputHash（对指令正文）。运行期与本次 ask 的哈希逐条比对，一致才命中。 */
  inputHash: string;
  result: unknown;
  stats?: AskStats;
  /**
   * 该 ask 结算后源会话的消息数（{@link NodeRecord.messageBoundary}）。**必填**：
   * run service 的「无 marker 前驱整体拒绝」门保证每条可导条目都带边界，所以引擎这边
   * 不必有缺席分支——种子截断没有边界就无从谈起。
   */
  messageBoundary: number;
}
export interface ImportedActorCandidate {
  /** 前驱记录的规范化 persona——运行期 createActor 比对用（不一致即弃该候选）。 */
  persona: PersonaSpec;
  /** 最长全 completed ask 前缀，按 actorSeq 0..n-1 索引。 */
  entries: ImportedAskEntry[];
  /**
   * 经 `resumed_from` 链解析出的转录源会话 id。service 保证在场——链上没有任何祖先
   * 持有该 actor 会话的候选在 service 侧就已弃置（降级为全新 actor），所以这里不是可选。
   */
  transcriptSourceSessionId: string;
  /**
   * 前驱解析出的模型 pin，随种子带给 driver。**仅当真的导入了转录时生效**：一条也没命中的
   * actor 走全新解析、不带 pin（见 scheduler 的 ensureSession）。
   */
  resolvedModel?: string;
}
export interface ImportedWorldEntry {
  inputHash: string;
  kind: NodeKind;
  result: unknown;
}
export interface ImportedRunCache {
  /** 键 = 有效 actor 名（前驱内唯一且非空的那些）。 */
  actors: ReadonlyMap<string, ImportedActorCandidate>;
  /**
   * 键 = `inputHash({op, args})`；值 = 按前驱 listNodes 插入序排好的队列——同一个
   * `{op,args}` 的第 n 次出现对第 n 条记录，队列头即下一次命中。
   */
  world: ReadonlyMap<string, ImportedWorldEntry[]>;
}
```

### `apps/cli/packages/dynamic-workflow/src/engine/imported-cache.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export class ImportedActorState {
  /** 已消费的导入条目数 = 下一个可命中的 actorSeq（也是转录截断边界的下标 + 1）。 */{ … }
export class ImportedWorldQueue {{ … }
export function matchImportedActor(
  cache: ImportedRunCache | undefined,
  spec: PersonaSpec,
): ImportedActorState | undefined
export function importedAskRecord(
  runId: string,
  instance: InstanceRef,
  actor: ActorRef,
  seq: number,
  hash: string,
  entry: ImportedAskEntry,
): NodeRecord
```

### `apps/cli/packages/dynamic-workflow/src/engine/index.ts`

导出 70 项（运行时 70 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export { WorkflowEngine } from "./engine.js";
export { EngineConfig } from "./engine.js";
export { RunSettlement } from "./engine.js";
export { InMemoryJournalStore } from "./journal-memory.js";
export { ConcurrencyController } from "./concurrency.js";
export { CONCURRENCY_DECREASE_FACTOR } from "./concurrency.js";
export { CONCURRENCY_FLOOR } from "./concurrency.js";
export { CONCURRENCY_IDLE_RESET_MS } from "./concurrency.js";
export { CONCURRENCY_INCREASE_AFTER_SUCCESSES } from "./concurrency.js";
export { CONCURRENCY_INCREASE_STEP } from "./concurrency.js";
export { ConcurrencyControllerSnapshot } from "./concurrency.js";
export { ConcurrencyThrottleReason } from "./concurrency.js";
export { canonicalJson } from "./hash.js";
export { fnv1a } from "./hash.js";
export { inputHash } from "./hash.js";
export { WorkflowError } from "./types.js";
export { INSTRUCTIONS_HEAD_MAX_CHARS } from "./types.js";
export { LAST_TOOL_NAME_MAX_CHARS } from "./types.js";
export { LAST_TOOL_TARGET_MAX_CHARS } from "./types.js";
export { NUDGE_ATTEMPTS } from "./types.js";
export { REPAIR_ATTEMPTS } from "./types.js";
export { refToString } from "./types.js";
export { ActorId } from "./types.js";
export { ActorRecord } from "./types.js";
export { ActorRef } from "./types.js";
export { ActorSessionSeed } from "./types.js";
export { ArtifactPublishRequest } from "./types.js";
export { ArtifactRef } from "./types.js";
export { ArtifactVersionRecord } from "./types.js";
export { AskMessage } from "./types.js";
export { AskLastTool } from "./types.js";
export { AskProgress } from "./types.js";
export { AskSpec } from "./types.js";
export { AskStats } from "./types.js";
export { AskWaitInfo } from "./types.js";
export { ConcurrencyChange } from "./types.js";
export { ConcurrencyChangeReason } from "./types.js";
export { Caps } from "./types.js";
export { InstanceRef } from "./types.js";
export { JournalStorePort } from "./types.js";
export { ImportedActorCandidate } from "./types.js";
export { ImportedAskEntry } from "./types.js";
export { ImportedRunCache } from "./types.js";
export { ImportedWorldEntry } from "./types.js";
export { ListEventsOptions } from "./types.js";
export { NodeKind } from "./types.js";
export { NodeOutcome } from "./types.js";
export { NodeRecord } from "./types.js";
export { NodeRecordStatus } from "./types.js";
export { WorldReadInput } from "./types.js";
export { WORLD_READ_INPUT_MAX_BYTES } from "./types.js";
export { PersonaSpec } from "./types.js";
export { RunEvent } from "./types.js";
export { RunRecord } from "./types.js";
export { RunSettlementRecord } from "./types.js";
export { RunStallInfo } from "./types.js";
export { RunStatus } from "./types.js";
export { RunStopReason } from "./types.js";
export { SessionRef } from "./types.js";
export { StoredEvent } from "./types.js";
export { SubmitVerdict } from "./types.js";
export { ValidateFn } from "./types.js";
export { WorkflowDriver } from "./types.js";
export { WorkflowErrorCode } from "./types.js";
export { WorkflowErrorJson } from "./types.js";
export { ProviderStopDetails } from "./types.js";
export { WorkflowErrorMismatch } from "./types.js";
export { WorkflowHostApi } from "./types.js";
export { WorkflowReportSink } from "./types.js";
export { WorldReadOp } from "./types.js";
```

### `apps/cli/packages/dynamic-workflow/src/engine/journal-memory.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export class InMemoryJournalStore implements JournalStorePort {
  // 以 runId 分桶，贴合"一个 store 可承载多个 run"的存储语义。{ … }
```

### `apps/cli/packages/dynamic-workflow/src/engine/run-terminal.ts`

导出 2 项（运行时 0 / 纯类型 2），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface ProviderStopDetails {
  kind: "auth" | "not_configured" | "model_unavailable" | "invalid_request" | "quota" | "other";
  reason: string;
  providerId?: string;
  providerLabel?: string;
  modelId?: string;
  providerCode?: string;
  /** 触发停止的子代理（`refToString(instance)`）与它的名字 / 出生阶段（有则带）。 */
  subagent?: string;
  subagentName?: string;
  phase?: string;
  /** provider 的原文，逐字（有界，由 driver 截断）。 */
  rawMessage?: string;
  /** 配额类：provider 给出的重置时刻（epoch ms），能解析出来才在场。 */
  resetAt?: number;
}
export interface RunStallInfo {
  sinceMs: number;
  reason?: string;
  cap?: number;
}
```

### `apps/cli/packages/dynamic-workflow/src/engine/scheduler-helpers.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function hashMismatch(instance: InstanceRef, expected: string, got: string): WorkflowError;
export function describeCause(cause: unknown): string;
export function headOfInstructions(instructions: string): string | undefined;
```

### `apps/cli/packages/dynamic-workflow/src/engine/scheduler-submit.ts`

导出 3 项（运行时 2 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface SubmitSeam {
  readonly host: SchedulerHost;
  liveNode(instance: InstanceRef): AskNode | undefined;
  settleOk(node: AskNode, artifact: unknown): void;
  settleFailed(node: AskNode, error: WorkflowError): void;
}
export function handleSubmitAttempted(
  seam: SubmitSeam,
  instance: InstanceRef,
  payload: unknown,
): void;
export function handleTurnEnded(seam: SubmitSeam, instance: InstanceRef, finalText: string): void;
```

### `apps/cli/packages/dynamic-workflow/src/engine/scheduler-types.ts`

导出 5 项（运行时 1 / 纯类型 4），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
export function defer<T>(): Deferred<T>;
export interface SchedulerHost {
  readonly runId: string;
  readonly caps: Caps;
  readonly driver: WorkflowDriver;
  readonly validate: ValidateFn;
  /** 分配某站点的下一个执行序号（与 world-read/actor 共用一套计数器）。 */
  nextOrdinal(siteId: string): number;
  /** 事件既落 journal 又扇出（Boundary C）。 */
  record(event: RunEvent): void;
  isRunSettled(): boolean;
  /** run 已结算时用于 reject 的错误。 */
  runError(): WorkflowError;
  /** run 级失败。 */
  failRun(error: WorkflowError): void;
  /**
   * 导入缓存是否已关闭（amend-resume）。关门由引擎自己做
   * （driver 上报 askMutating、或 live 的 world-run），调度器只读这个位——一个 ask 转 live 本身
   * **不**关门：它还什么都没改。
   */
  importCacheClosed(): boolean;
  /** 该记录行在崩溃前是否 live 跑过（resume 时引擎从事件恢复；非 resume 恒 false）。 */
  wasLiveBeforeResume(instance: InstanceRef): boolean;
}
export interface AskNode {
  instance: InstanceRef;
  actor: Actor;
  actorSeq: number;
  instructions: string;
  hash: string;
  spec: AskSpec;
  deferred: Deferred<unknown>;
  repairsRemaining: number;
  nudgesRemaining: number;
  settled: boolean;
  dispatched: boolean;
  lastStats?: AskStats;
}
export interface Actor {
  ref: ActorRef;
  id: ActorId;
  persona: PersonaSpec;
  name?: string;
  /** journal 中该 actor 已记录的 ask 节点数——replay 时 live 节点须等其全部准入后才放行。 */
  recordedCount: number;
  /** 下一个待准入的 actorSeq。 */
  nextAdmitSeq: number;
  /** 已到达但未准入的记录节点释放动作，按 actorSeq 挂起（hold 规则）。 */
  pendingRecorded: Map<number, () => void>;
  /** 已到达但在等记录节点排空的 live 节点释放动作，按到达顺序。 */
  pendingLive: Array<() => void>;
  /** 已准入待派发的 live 节点（FIFO = 准入顺序）。 */
  liveQueue: AskNode[];
  /** 正在执行的 live 节点（actor 串行，至多一个）。 */
  current?: AskNode;
  /** 会话惰性创建，缓存其 promise（每 actor 一次）。 */
  sessionPromise?: Promise<SessionRef>;
  session?: SessionRef;
  /**
   * amend-resume 的导入消费态（引擎在 createActor 里按名 + persona 匹配后挂上，见
   * imported-cache.ts 的 `matchImportedActor`）。缺席即该 actor 全新重跑。
   */
  imported?: ImportedActorState;
}
```

### `apps/cli/packages/dynamic-workflow/src/engine/scheduler.ts`

导出 3 项（运行时 2 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type { SchedulerHost } from "./scheduler-types.js"
export { hashMismatch } from "./scheduler-helpers.js"
export class AskScheduler {{ … }
```

### `apps/cli/packages/dynamic-workflow/src/engine/types.ts`

导出 60 项（运行时 8 / 纯类型 52），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface InstanceRef {
  siteId: string;
  ordinal: number;
}
export interface ActorRef {
  siteId: string;
  ordinal: number;
}
export type ActorId = string;
export function refToString(ref: InstanceRef | ActorRef): string
export interface PersonaSpec {
  name?: string;
  system?: string;
}
export interface AskMessage {
  instructions: string;
  typed: boolean;
  schema?: unknown;
}
export type { Violation } from "../schema/types.js"
export type ValidateFn = (schema: unknown, value: unknown) => Violation[];
export interface AskSpec {
  typed: boolean;
  schema?: unknown;
}
export type ImportCloseCause = "mutating-tool" | "world-run";
export interface Caps {
  maxConcurrency: number;
}
export type { ProviderStopDetails } from
export type { RunStallInfo } from
export type WorkflowErrorCode =
  | "ValidationFailed"
  | "ResultNotSubmitted"
  | "DriverError"
  | "WorldReadCapExceeded"
  | "Cancelled"
  | "ContextLimit"
  | "ReportCapExceeded"
  | "InputHashMismatch"
  | "UnknownActor"
  | "MissingAskSpec"
  | "DuplicateActorName"
  | "ScriptHashMismatch"
  | "Interrupted"
  | "ProviderStop"
  // ——————————— 用户面产物 ———————————
  // ⚠ 术语：这一批 artifact 全是**用户面产物**（脚本发布给用户看的产出），与
  // `RunSettlement.artifact`（顶层返回值）无关。
  //
  // 通道按**成员族**分裂，与 WorldReadCapExceeded / ReportCapExceeded 的分界同一条论证：
  // 内容成员（`file`/`markdown`）返回 promise，脚本可 catch，所以是节点级拒绝；预置成员
  // 返回 void，没有可拒绝进去的地方，所以同样的事实在那一族是 failRun。三个 driver 侧的
  // 码（Missing/Outside/TooLarge/StoreUnavailable）只可能来自内容成员，故恒为节点级。
  | "ArtifactSourceMissing"
  | "ArtifactPathOutsideWorkspace"
  | "ArtifactTooLarge"
  | "ArtifactStoreUnavailable"
  | "ArtifactVersionCapExceeded"
  | "ArtifactKindMismatch"
  | "ArtifactCapExceeded"
  | "ArtifactSpecInvalid"
  | "ArtifactRedeclared"
  | "ArtifactUndeclared"
  // 第二个 id 想当 primary：内容成员是节点级拒绝，
  // 预置成员是 failRun——与上面几条同一条分界。
  | "ArtifactPrimaryConflict";
export interface WorkflowErrorMismatch {
  expected: string;
  got: string;
}
export interface WorkflowErrorJson {
  code: WorkflowErrorCode;
  message: string;
  violations?: Violation[];
  finalText?: string;
  mismatch?: WorkflowErrorMismatch;
  /** 只在 `code === "ProviderStop"` 时在场。 */
  providerStop?: ProviderStopDetails;
}
export { WorkflowError } from "./workflow-error.js"
export type { WorldReadOp } from
export type { ArtifactContentOp } from
export type { ArtifactOp } from
export type { ArtifactPresetOp } from
export interface ArtifactRef {
  id: string;
  version: number;
}
export interface ArtifactVersionRecord {
  id: string;
  kind: ArtifactOp;
  /** 从 1 起。预置声明恒为 1（声明没有版本，它只有一次）。 */
  version: number;
  title?: string;
  description?: string;
  /** 内容成员的 MIME 类型（扩展名表或 `opts.contentType`）。 */
  contentType?: string;
  /** 内容成员的字节数。 */
  bytes?: number;
  /** store 返回的 `knorvia-artifact://…`（内容成员）。 */
  uri?: string;
  /** 工作区相对的原路径（`file` 才有，作出处与「在工作区显示」）。 */
  sourcePath?: string;
  /** 预置成员的 spec（规范化后的形状；引擎按 canonicalJson 比对重复声明）。 */
  spec?: unknown;
  /** 发布时刻（epoch 毫秒）。driver / 宿主写入——引擎没有时钟。 */
  publishedAt?: number;
  /**
   * 这个 id 是本 run 的交付物。**引擎**盖章，
   * 不是 driver：按 id 粘着——一旦某版带上，之后的版本都带上，不管发布时有没有再写 `primary`。
   */
  primary?: true;
}
export interface ArtifactPublishRequest {
  runId: string;
  siteId: string;
  ordinal: number;
  op: ArtifactContentOp;
  id: string;
  version: number;
  /** `file`：工作区相对路径。 */
  path?: string;
  /** `markdown`：正文。 */
  content?: string;
  /** 脚本给的 `opts`（原样透传，形状校验归 driver）。 */
  opts?: unknown;
}
export interface WorkflowHostApi {
  createActor(siteId: string, name?: string, persona?: string | PersonaSpec): ActorId;
  ask(siteId: string, actor: ActorId, instructions: string): Promise<unknown>;
  worldRead(siteId: string, op: WorldReadOp, args: unknown[]): Promise<unknown>;
  /**
   * 发布一条中间结果。**即发即忘（同步签名、无返回值）却有站点、要落 journal**——这个组合
   * 就是 report 的全部设计，两半都是被迫的：脚本发布一条发现，没有什么可以 await；而
   * run 面板与完成通知在 resume 之后不能把同一条发现显示两次，所以必须 journal。
   *
   * 无 driver 往返：引擎在核心里落节点、发事件（或在 replay 命中时静默跳过）即结束。
   */
  report(siteId: string, item: unknown, artifactId?: string): void;
  /**
   * 控制流经过了一个 `phase("…")` 标记。同步、无返回值、无 driver 往返、**不落 journal 行**：
   * 引擎只发一条 `phase-entered` 事件就结束。`name` 由 lowering 从字面量取出并去两端空白。
   */
  enterPhase(name: string): void;
  /**
   * 发布一个**内容产物**（`artifact.file` / `artifact.markdown`）。效应：经 driver 把字节拷进
   * store，落一行 journal，成功兑现 {@link ArtifactRef}、失败**可 catch 地拒绝**。
   *
   * 与 `worldRead` 同规：`args` 是脚本调用点的位置实参（`[id, path, opts]`），lowering 原样
   * 打包，本层只从中取引擎自己要用的 id（上限与版本号要它），其余透传给 driver。
   */
  publishArtifact(siteId: string, op: ArtifactContentOp, args: unknown[]): Promise<ArtifactRef>;
  /**
   * 声明一个**预置产物**（`artifact.chart` / `table` / `metrics` / `board`）。同步、无返回值、
   * **不经 driver**：一个声明没有可等的东西，引擎在核心里校验 spec、落节点、发事件就结束。
   *
   * 失败（spec 非法 / 同 id 异 spec / 超上限）一律 failRun——void 返回没有拒绝通道，与
   * `report` 同一条论证。
   */
  declareArtifact(siteId: string, op: ArtifactPresetOp, args: unknown[]): void;
  log(message: string): void;
}
export interface SessionRef {
  readonly id: string;
}
export type SubmitVerdict =
  | { kind: "accept" }
  | { kind: "reject"; violations: Violation[] }
  | { kind: "nudge" };
export interface WorkflowDriver {
  /**
   * 铸一个 actor 会话。`seed` **仅当该 actor 消费了 ≥1 条导入 ask 条目时在场**
   * （amend-resume 的转录截断，见 {@link ActorSessionSeed}）：driver 必须在返回之前把源会话
   * 的前 `messageCount` 条消息复制进新铸的会话，且这一步要**幂等**——目标会话已有内容时跳过，
   * 那是崩溃后 resume 重挂同一个会话 id 的情形（会话 id 由 driver 按 (runId, actorRef) 纯确定地铸出）。
   *
   * 参数可选：既有 driver 实现少写一个形参在 TS 里合法，不带种子语义的 driver（fake、
   * 纯 replay 测试）可以直接忽略它。
   */
  createActorSession(
    actor: ActorRef,
    persona: PersonaSpec,
    seed?: ActorSessionSeed,
  ): Promise<SessionRef>;
  startAsk(session: SessionRef, instance: InstanceRef, message: AskMessage): void;
  respondToSubmit(instance: InstanceRef, verdict: SubmitVerdict): void;
  cancelAsk(instance: InstanceRef): void;
  /**
   * 执行一次世界读取。`args` 是脚本调用点的**位置实参**，lowering 原样打包、不做任何检查；
   * 每个 op 的元数与实参校验归 driver（见 {@link WorkflowHostApi.worldRead}）。
   */
  executeWorldRead(op: WorldReadOp, args: unknown[]): Promise<unknown>;
  /**
   * 发布一个内容产物的字节：校验实参形状、
   * 解析工作区相对路径（越界拒绝）、读字节（cap+1 探测，超限拒绝不截断）、按扩展名定
   * contentType、写 tool-artifact store，返回落库记录。
   *
   * **可选**：纯 replay / fake 装配没有 store 也没有文件系统。缺席时引擎以
   * `ArtifactStoreUnavailable` 拒绝该节点——大声的一条命名失败，不是静默降级（预置成员不
   * 受影响，它们本来就不过 driver）。
   */
  executeArtifactPublish?(request: ArtifactPublishRequest): Promise<ArtifactVersionRecord>;
  journal: JournalStorePort;
  emit(event: RunEvent): void;
  /**
   * run 结算后的资源释放：引擎在三条终态路径（complete / cancel / fail）记下 `run-settled`
   * 之后恰好调一次。生产 driver 在这里对每个 actor runtime 跑 app 关会话的同一条关闭链
   * （runtime 的 `closeBrowserSession`：beginShutdown + node_repl 会话释放 + 浏览器会话关闭）
   * 并清空会话表；在飞 ask 此刻已被 cancelAsk 中止。可选：fake / 纯 replay 装配没有可释放
   * 的东西。
   */
  dispose?(): void;
}
export interface AskWaitInfo {
  cause: "slot" | "backoff";
  reason?: string;
  attempt?: number;
  delayMs?: number;
  retryAfterMs?: number;
}
export type ConcurrencyChangeReason =
  | "rate_limited"
  | "provider_overloaded"
  | "offpeak_queued"
  | "recovered"
  | "idle_reset";
export interface ConcurrencyChange {
  /** provider key（`${providerId}/${modelId}`）。 */
  key: string;
  previous: number;
  next: number;
  reason: ConcurrencyChangeReason;
  lastGood?: number;
  lastBad?: number;
  /** 带 Retry-After 的限流：新派发冻结的时长（相对量）。 */
  cooldownMs?: number;
}
export interface WorkflowReportSink {
  /** 一次 submit 尝试；核心校验后经 respondToSubmit 回裁决。 */
  askSubmitAttempted(instance: InstanceRef, payload: unknown): void;
  /** 一轮 turn 结束且未提交：核心决定 nudge，或据 finalText 结算 untyped ask。 */
  askTurnEnded(instance: InstanceRef, finalText: string): void;
  /**
   * 一次 turn 解析时的进度观察：引擎只
   * `record()` 成 `node-progress`，不据它做任何决策。**必须先于同一次 turn 的 askStats 调用**
   * ——两条事件的先后是读面的契约。run 已结算后到达的调用被忽略。
   */
  askProgress(instance: InstanceRef, progress: AskProgress): void;
  /** 用量统计：累计 run 用量并广播 usage/instance 更新。 */
  askStats(instance: InstanceRef, stats: AskStats): void;
  /** driver 侧不可恢复错误，结算该 ask 为失败。 */
  askFailed(instance: InstanceRef, error: WorkflowError): void;
  /**
   * 确定性的模型侧错误：**不**结算
   * 节点，而是让整个 run 以 `stopped(provider)` 停下（在飞 ask 一律 abort，与 cancel 同）。
   * `error.code` 必须是 `ProviderStop`。run 已结算后到达的调用被忽略。
   */
  stopRun(error: WorkflowError): void;
  /** run 级停滞观察：引擎只 `record()`。 */
  runStalled(info: RunStallInfo): void;
  /**
   * 三个纯观察：引擎只 `record()`，不做任何决策。
   * run 已结算 / 节点已结算后到达的调用被忽略。
   */
  /** 该 ask 的下一个模型请求在等：进程级准入闸门（slot）或 runner 退避（backoff）。 */
  askWaiting(instance: InstanceRef, info: AskWaitInfo): void;
  /** 该 ask 的一个模型请求真正发出了（`model_request_started`，且进入前不在 executing）。 */
  askExecuting(instance: InstanceRef): void;
  /**
   * 该 ask 的子代理**即将**执行一个会改写工作区的工具：
   * 引擎据此关闭导入缓存。这是唯一一个引擎据以做决策的 driver 观察——缓存的答案是对前驱世界
   * 说的，第一笔写入之后那个世界就不存在了。工具还没动手就上报（PreToolUse 之后、handler 之前），
   * 所以关门先于第一个字节落盘。run 已结算 / 节点已结算后到达的调用被忽略。
   */
  askMutating(instance: InstanceRef): void;
  /** 进程级治理器调整了本 run 所在 provider key 的 cap。 */
  concurrencyChanged(change: ConcurrencyChange): void;
}
export type NodeKind = "ask" | "world-read" | "world-run" | "report" | "artifact";
export interface WorldReadInput {
  op: string;
  args: unknown[];
  truncated?: true;
}
export const WORLD_READ_INPUT_MAX_BYTES = 4096
export type NodeOutcome = "ok" | "failed" | "cancelled";
export type RunStatus = "pending" | "running" | "completed" | "errored" | "stopped";
export type RunStopReason = "user" | "model" | "provider" | "interrupted" | "superseded";
export type RunEvent =
  | { type: "run-started"; runId: string; caps: Caps }
  /**
   * 发起 run 的那一轮：`inputId` 是父会话里发起这次
   * run 的 turn 的 inputId（中枢直接启动为铸出的 UUID v7）。**只在建 run 那一世记一次**，紧跟第一条
   * `run-started`；resume 再发 `run-started` 时不再发它——同 run 的子代理 step 因此永远挂在同一个
   * message 下。零 SQL：锚点活在 journal 事件里，不在 dwf_run 列上（刻意不做迁移）。
   * `phaseNames` 是脚本声明的阶段表（声明序），由提交方从因果图填入；侧栏迷你轨道据此画出前方
   * 的站点。同样只记一次，
   * 冷重放免费重建；脚本没有 `phase()` 标记时缺席。
   * `subagentModel` 是本 run 的子代理跑在哪个模型上，规范形 `providerId/modelId[$reasoningLevel]`。与锚点、阶段表同一路宿主元数据：引擎**从不读它**，
   * 只在建 run 那一世随这条事件记一次；宿主在 resume 与两条读面上从事件头读回同一个串
   * （子代理会话按「本字段 > resume pin > 父会话模型」定选型，bootstrap 的
   * workflow-actor-model.ts）。同样零 SQL——不在 `dwf_run` 列上。缺席即子代理跑在会话模型上。
   * `phaseAlongside` 与 `phaseNames` **按位置对齐**：`phaseAlongside[i]` 是进入 `phaseNames[i]` 时
   * strand 仍在跑的其他阶段的下标（下标落在同一张 `phaseNames` 里）。侧栏据此把并行的两站画成
   * 双线段；没有阶段并行时缺席，缺席就是「这条轨道是一条直线」。
   * `scriptPath` 是本 run 的脚本**来自哪个文件**（绝对路径）。与 `subagentModel` 逐条同规：引擎从不读、只在建 run 那一世
   * 记一次、零 SQL，宿主在两条读面上从事件头读回同一个串。缺席即这个 run 没有可编辑的脚本
   * 文件（草稿写不下去的项目、本特性之前发起的 run），模型面因此退回内联重提交的老话。
   */
  | {
      type: "run-launched";
      inputId: string;
      toolCallId?: string;
      parentSessionId?: string;
      phaseNames?: string[];
      subagentModel?: string;
      scriptPath?: string;
      phaseAlongside?: number[][];
    }
  /**
   * `phaseName` 记录实例出生时最近一次 `enterPhase` 指定的阶段名。
   * 只出现在**出生事件**上——actor 的 `actor-created`、
   * 节点的 `node-queued`、以及命中缓存（replay / amend-resume）时代替 queued 的
   * `node-settled { cached: true }`；其余 `node-*` 事件不带，reducer 沿用 `actorSiteId`
   * 的先例向前携带。标记之前出生的实例整个键缺席。
   *
   * 它**不是**发出这条事件时的当前阶段：node-queued 可能被 hold 规则推迟到下一个标记
   * 之后才发出，而出生时刻在上一个阶段。
   */
  | {
      type: "actor-created";
      actor: ActorRef;
      name?: string;
      persona?: PersonaSpec;
      phaseName?: string;
    }
  | {
      type: "node-queued";
      instance: InstanceRef;
      kind: NodeKind;
      actor?: ActorRef;
      actorSeq?: number;
      phaseName?: string;
      /**
       * 作者指令的**开头** {@link INSTRUCTIONS_HEAD_MAX_CHARS} 个字符（去两端空白，不加省略号），
       * 只在 ask 节点上在场。事件轨上「这个子代理在干什么」的唯一答案：完整指令只活在
       * `dwf_node.input_json` 里，而读面（run 详情、GetWorkflowRun）不为一行摘要去读那张表。
       *
       * 取的是**准入时刻**的指令，也就是引擎尾注追加之前的那一份——尾注是引擎的话，不是作者的。
       */
      instructionsHead?: string;
    }
  | { type: "node-dispatched"; instance: InstanceRef }
  | { type: "node-repairing"; instance: InstanceRef; attempt: number; violations: Violation[] }
  | { type: "node-nudged"; instance: InstanceRef }
  /**
   * 自适应并发的三个观察事件。与 escalation 同族：
   * 引擎核心不据它们做任何决策，它们只是 driver / 治理器观察到的事实经引擎 `record()` 落
   * journal + 扇出。`node-waiting` ⇄ `node-executing` 是 dispatched 之后、settled 之前的自环
   * （`executing` 由此成为**可观察**相位），不改变节点的 journal 记录
   * （不写 dwf_node）。
   */
  | ({ type: "node-waiting"; instance: InstanceRef } & AskWaitInfo)
  | { type: "node-executing"; instance: InstanceRef }
  | ({ type: "concurrency-changed" } & ConcurrencyChange)
  | {
      type: "node-settled";
      instance: InstanceRef;
      outcome: NodeOutcome;
      cached?: boolean;
      error?: WorkflowErrorJson;
      /** 仅 `cached: true` 时在场：命中的节点没有 queued，这条就是它的出生事件。 */
      phaseName?: string;
    }
  /**
   * 一条 ask 在一次 turn 解析时的进度。
   * 与 escalation / 并发那几个观察同族：**引擎核心不解释它**，只 `record()`——它不改任何调度
   * 决策、不进 inputHash、replay 不比对它。同一次 turn 的两条事件顺序是载荷性的：
   * 本条先于 `usage-updated`，于是读到新用量的人一定已经读到了挣来它的那次进度。
   */
  | ({ type: "node-progress"; instance: InstanceRef } & AskProgress)
  /** run 级 token 用量更新：直接携带已花总量（journal 的 spent_tokens 同步写入，二者永远相等）。 */
  | { type: "usage-updated"; spentTokens: number }
  | { type: "log"; message: string }
  /**
   * amend-resume 的导入缓存关闭了：某个 live 子代理即将
   * 改写工作区（`cause: "mutating-tool"`，`actorName` 是它的有效名），或一条 `world.run` live 执行
   * （`cause: "world-run"`）。每个 run 最多一条；修订 run 崩溃后 resume 据它恢复「门已关」——这是
   * 关门的**唯一**事实来源，不再由「曾有 ask live」推断。非修订 run 没有表可关，不发。
   */
  | {
      type: "import-cache-closed";
      instance: InstanceRef;
      cause: ImportCloseCause;
      actorName?: string;
    }
  /**
   * 控制流经过了一个 `phase("…")` 标记。**无站点、无 journal 行、无 driver 往返**——标记不是一步工作，它只是
   * 「跑到哪了」的一个刻度。`name` 是作者的原词（去两端空白，与分析器铸造阶段 id 的键同一）；
   * `ordinal` 按名字计数，**每次求值都发**：同名再入即 +1，分析器也正是把第二个同名标记读成
   * 回边。resume 时脚本重跑会把前缀再发一遍（没有 journal 行可去重），消费者单调归约即免疫。
   */
  | { type: "phase-entered"; name: string; ordinal: number }
  /**
   * 一条被发布的中间结果，每个**未被跳过**的 report 调用恰好一次（replay 命中即静默跳过，
   * 不重发）。走与其他 run 事件完全相同的路线（进度汇 → 有界会话事件 → 投影 reducer），
   * 终点是 run 面板的 Results 区。
   *
   * `artifactId` 在场即这条 item 同时喂给了那个预置产物（`report(item, "perf")`）——投影据它
   * 给该产物的 `itemCount` 加一，看板 hook 以计数变化为增量取数的信号。
   */
  | { type: "report"; instance: InstanceRef; item: unknown; artifactId?: string }
  /**
   * 一个**用户面产物**的新版本已就位：内容成员每成功发布一次一条，预置成员每次真正落下
   * 声明（幂等 no-op 不发）一条。与 report 同规——replay 命中不重发，冷恢复从 journal 读。
   *
   * 成功路径**只发这一条**，不发任何节点生命周期事件（node-queued / dispatched / settled）。
   * 与 `report` 同一条论证：产物是交付物，不是别人能等的一步，它在两张图里都不是节点。
   */
  | { type: "artifact-published"; instance: InstanceRef; artifact: ArtifactVersionRecord }
  /**
   * 一次内容产物发布失败（节点以 `failed` 落 journal，脚本那侧拿到一个可 catch 的拒绝）。
   *
   * **刻意不复用 `node-settled{failed}`**：那个事件的读者会把它归约进 `nodes[]` 并要求站点在
   * 图里有对应的节点，而产物站点**不进任何图**——一条 node-settled 落在这样的站点上，在 run
   * 面板里就是一个无从解释的「未知节点」，图层还会报告一个不认识的 site id。发布的失败因此
   * 需要自己的事件：它带着足以渲染一张失败卡的东西（id / 种类 / 结构化错误），而不冒充一步
   * 工作。replay 命中一条失败记录时**不重发**（同 report / artifact-published）。
   */
  | {
      type: "artifact-failed";
      instance: InstanceRef;
      id: string;
      op: ArtifactContentOp;
      error: WorkflowErrorJson;
    }
  | { type: "compaction"; actor: ActorRef }
  /**
   * 一个 actor 把阻塞问题升级给了主代理，并停驻在自己那次 ask 里等答案。
   *
   * **引擎核心从不发这两个事件**——它们由 driver 在执行 ask 的边界内发出（与 repair /
   * nudge 轮次同层），零 I/O 状态机不感知升级。之所以仍然住在这份词汇表里：它们走的是与
   * 其他 run 事件完全相同的两条轨（journal 的 dwf_event + driver.emit 的实时扇出），而那两条
   * 轨的形状由 `RunEvent` 定义。升级**不写 dwf_node 行**（等待不是工作量）。
   */
  | {
      type: "escalation-raised";
      qid: string;
      actor: ActorRef;
      /**
       * actor 的**有效名**（= `normalizePersona` 后的 `spec.name`，也就是 `actor-created`
       * 事件上那一个、以及 amend-resume 用作缓存身份键的那一个）。匿名 actor 缺席，
       * 且不合成兜底标签——消费者各自决定怎么渲染「无名」。
       */
      actorName?: string;
      question: string;
      context?: string;
      /**
       * 提问时刻（epoch 毫秒）。**必填**：读者要回答的第一个问题恒是「这个问题已经等了多久」，
       * 而事件轨上没有别的时钟可用——`dwf_event.time_created` 只在 durable 那一轨上有，实时轨
       * （driver.emit → progress sink → 侧栏）拿不到它，让 UI 用「收到事件的本地时刻」兜底就会
       * 在冷启动重放整段历史时把每个问题都显示成刚刚提的。
       *
       * 与快照 `pendingQuestions[].askedAt` **同一个瞬间**（driver 只取一次 `Date.now()`，
       * 事件与停驻记录共用），所以两条读面上的等待时长永远一致。
       */
      askedAt: number;
    }
  | { type: "escalation-resolved"; qid: string; answer: string }
  /** run 级停滞观察（见 {@link RunStallInfo}）；run 结算后到达的调用被忽略。 */
  | ({ type: "run-stalled" } & RunStallInfo)
  /**
   * `stopReason` 只在 `status === "stopped"` 时在场；`error` 在 `errored` 恒在场，在
   * `stopped` 只对 `provider`（`ProviderStop`）与 `interrupted`（`Interrupted`）在场。
   */
  | {
      type: "run-settled";
      status: RunStatus;
      stopReason?: RunStopReason;
      /** `stopReason === "superseded"` 时在场：停下本 run 的那次修订铸出的新 run。 */
      supersededBy?: string;
      error?: WorkflowErrorJson;
    };
export interface RunRecord {
  runId: string;
  parentSessionId?: string;
  cwd?: string;
  /**
   * 人给的 run 名字（`CreateWorkflow` 的可选 `input.name`）。纯展示元数据：引擎不读它，
   * 只在 createRun 时随 scriptText / cwd 一起落库，供宿主的枚举面拿来当标签——否则跨会话
   * 列出来的只能是一串裸 runId。缺席即没起名（读侧按脚本首行兜底，不回写）。
   */
  name?: string;
  /**
   * 发起这次 run 的 CreateWorkflow 工具调用 id。纯宿主元数据：引擎不读它，只在 createRun
   * 时随 scriptText / cwd 一起落库。它是重启后仅存的关联锚点——`workflowRuns` 投影跨进程
   * 不存活，工具卡 join、resume 的通知锚点都只能从这里还原。
   */
  toolCallId?: string;
  scriptText?: string;
  scriptHash?: string;
  /**
   * 本次 run 的实参（saved workflow 的声明式参数，已校验并回填默认值）。
   *
   * 与 `scriptText` 同级的 run **身份**的一部分，不是展示元数据：resume 重放这里存下的
   * 实参，永不接受新的——换实参就是另一次 run，该走一次新的确认窗。缺席（老行的 NULL）
   * 解读为 `{}`，不回填（不变式 6/7）。
   */
  args?: Record<string, unknown>;
  /**
   * amend-resume 的 lineage 指针：本 run 由哪个前驱 run 修订而来。宿主元数据，引擎不读它，只在 createRun 时随其余
   * 元数据落库。修订是 **supersede**——新 runId、新脚本、前驱行零触碰——所以两侧唯一的联系
   * 就是这个指针：resume 重建导入缓存（`port.resume` 见它在场即重建 ImportedCache）与
   * UI 的「续自 run X」都从这里还原。缺席即本 run 不是修订（绝大多数 run）。
   */
  resumedFrom?: string;
  caps: Caps;
  /** 累计 token 用量（观察面，不是控制面）。 */
  spentTokens: number;
  status: RunStatus;
  /** `status === "stopped"` 时在场（老行解码时缺席 ⇒ `user`，见仓储编解码）。 */
  stopReason?: RunStopReason;
  /** `stopReason === "superseded"` 时在场：替代本 run 的后继 run（与它的 `resumedFrom` 是同一条边的两端）。 */
  supersededBy?: string;
  failure?: WorkflowErrorJson;
  /** 脚本的顶层返回值。Present only for completed runs（`undefined` 产物即整字段缺席）。 */
  result?: unknown;
}
export interface ActorRecord {
  runId: string;
  siteId: string;
  ordinal: number;
  name?: string;
  persona?: PersonaSpec;
  sessionId?: string;
  /**
   * actor 实际跑在哪个模型上（`providerId/modelId`），由 driver 侧写入。
   *
   * 为什么不塞进 `persona`：persona 是引擎在 createActor 时同步写下的冻结身份，而模型是宿主
   * 事实（父会话**当时**的选择），引擎看不见。分成两个字段，身份与宿主事实就各有一个作者，
   * 谁写的谁负责。
   *
   * 为什么要落库：run 的成本因此可审计，且 resume 能重新附着到**同一个**模型——父会话在两次
   * 运行之间换了主模型，也不会让同一个 run 的后半段悄悄换模型（pin，见 bootstrap 的
   * workflow-actor-model.ts）。
   *
   * 与 `sessionId` 同属「driver 拥有的字段」：引擎的 putActor 只负责把已有值原样带过去
   * （见 engine.ts 的 createActor 与 scheduler.ts 的 ensureSession），绝不自己产出它。
   */
  resolvedModel?: string;
}
export type NodeRecordStatus = "running" | "completed" | "failed";
export interface NodeRecord {
  runId: string;
  siteId: string;
  ordinal: number;
  kind: NodeKind;
  actorSiteId?: string;
  actorOrdinal?: number;
  actorSeq?: number;
  inputHash: string;
  status: NodeRecordStatus;
  result?: unknown;
  error?: WorkflowErrorJson;
  stats?: AskStats;
  /**
   * **用户面产物**的 id（`dwf_node.artifact_id` 列）。两种行会带它：`kind: "artifact"` 的行
   * （它发布/声明的那个产物），以及带标签的 `kind: "report"` 行（这条 item 喂给了哪个预置）。
   * 后者正是「看板 = journal 的投影」这条不变式的落点——一个看板的每个点都是一行
   * `kind = report ∧ artifact_id = ?`。其余行为空。
   */
  artifactId?: string;
  /**
   * **world-read / world-run 节点专用**：这一站
   * 实际执行的 op 与实参，**有界**（{@link WorldReadInput}）。`inputHash` 只回答「同一个输入吗」，
   * 回答不了「输入是什么」——工作区 transcript 要说 *what ran*，不只是 *something ran*。
   * 准入即写（与 `inputHash` 同一次 putNode），结算的 upsert 原样带过去；0030 之前的行与
   * ask / report / artifact 行一律缺席。
   */
  input?: WorldReadInput;
  /**
   * **ask 节点专用**：该 ask 的完整交换（含 repair / nudge 轮与 submit 之后的收尾消息）结束后，
   * 该 actor 会话消息 log 的长度——一个 count offset，不是消息 id 区间。
   *
   * driver 拥有的补写字段（与 `stats` 回填同族、同样经 getNode + putNode 读改写落库），引擎
   * 不产出它。存 count 而不是 id 区间，是因为 count 的关键性质是**前缀复制下不变**：把源会话
   * 前 N 条消息复制进一个新会话，消息 id 全变而 count 不变，于是被复制 ask 的边界值在新会话里
   * 原样有效。这正是 amend-resume 全保真转录截断（以及链式修订）的根基。
   */
  messageBoundary?: number;
}
export interface StoredEvent {
  sequence: number;
  event: RunEvent;
  /**
   * 存储层追加这条事件的时刻（epoch 毫秒）。事件日志里一切「多久以前」的唯一时钟：
   * 日志行的年龄、子代理上一次动作的时刻、run 停滞了多久，都只能从它算。
   * 由读者现取 `Date.now()` 兜底是错的——那会把一次冷重放里一周前的整段历史全标成「刚刚」。
   *
   * 类型上可选，好让实现了端口的测试替身继续编译；两个**真**实现（SQLite 的 `time_created`
   * 列、内存实现的 append 时戳）都必须填，契约测试钉住这一条。
   */
  timeCreated?: number;
}
export interface ListEventsOptions {
  /** 只返回 sequence **严格大于**该值的事件。cursor 是"已读到的最后一个 sequence"，不是偏移量。 */
  afterSequence?: number;
  /** 单页最多返回的条数；缺省不限。 */
  limit?: number;
}
export interface RunSettlementRecord {
  /** 与 `status === "stopped"` 同时写入；其余状态不带。 */
  stopReason?: RunStopReason;
  /** 与 `stopReason === "superseded"` 同一笔写入（stopped 信封整体重写，分两笔会丢）。 */
  supersededBy?: string;
  failure?: WorkflowErrorJson;
  result?: unknown;
}
export interface JournalStorePort {
  createRun(record: RunRecord): void;
  getRun(runId: string): RunRecord | undefined;
  updateRunStatus(runId: string, status: RunStatus, settlement?: RunSettlementRecord): void;
  /**
   * 单独持久化累计 token 用量（run 结算之外的高频小写入）。未知 runId 必须抛错；
   * 绝不触碰 status / failure——用量更新与 run 结算是两条独立的写入路径。
   */
  updateRunUsage(runId: string, spentTokens: number): void;

  putActor(record: ActorRecord): void;
  getActor(runId: string, siteId: string, ordinal: number): ActorRecord | undefined;
  listActors(runId: string): ActorRecord[];

  putNode(record: NodeRecord): void;
  getNode(runId: string, siteId: string, ordinal: number): NodeRecord | undefined;
  listNodes(runId: string): NodeRecord[];

  appendEvent(runId: string, event: RunEvent): StoredEvent;
  /**
   * 按 sequence 升序列出事件。`opts` 缺省即全量（历史形态）；带 cursor / limit 时必须在
   * 存储层过滤，不得取全量再切片——分页存在的理由就是不把整条 journal 读进内存。
   * 未知 runId 与越界 cursor 一律返回空数组（不抛错）：投影与 journal 之间的竞态窗口里，
   * 客户端拿着一个尚未存在的 cursor 回来是正常时序。
   */
  listEvents(runId: string, opts?: ListEventsOptions): StoredEvent[];
}
export { INSTRUCTIONS_HEAD_MAX_CHARS } from "./ask-observation-types.js"
export { LAST_TOOL_NAME_MAX_CHARS } from "./ask-observation-types.js"
export { LAST_TOOL_TARGET_MAX_CHARS } from "./ask-observation-types.js"
export type { AskLastTool } from "./ask-observation-types.js"
export type { AskProgress } from "./ask-observation-types.js"
export type { AskStats } from "./ask-observation-types.js"
export type { ImportedActorCandidate } from "./imported-cache-types.js"
export type { ImportedAskEntry } from "./imported-cache-types.js"
export type { ImportedRunCache } from "./imported-cache-types.js"
export type { ImportedWorldEntry } from "./imported-cache-types.js"
export interface ActorSessionSeed {
  /** 转录来源会话（前驱或更早祖先的该名 actor 会话）。 */
  sourceSessionId: string;
  /**
   * 复制源会话前多少条消息 = 最后一条被消费导入 ask 的 {@link NodeRecord.messageBoundary}。
   * count offset 跨前缀复制不变，所以这个值在链上任何持会话祖先处都直接可用。
   */
  messageCount: number;
  /** 承袭的模型 pin（转录接续下静默换模型正是 pin 要防的身份突变）。 */
  resolvedModel?: string;
}
export const REPAIR_ATTEMPTS = 3
export const NUDGE_ATTEMPTS = 1
```

### `apps/cli/packages/dynamic-workflow/src/engine/workflow-error.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export class WorkflowError extends Error {{ … }
```

### `apps/cli/packages/dynamic-workflow/src/engine/world-read-input.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function boundWorldReadInput(op: string, args: readonly unknown[]): WorldReadInput;
```

## facade 资产与注册表（5 个文件）

### `apps/cli/packages/dynamic-workflow/src/facade/artifact-caps.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const ARTIFACT_CAPS = …
export const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/
```

### `apps/cli/packages/dynamic-workflow/src/facade/dts.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const FACADE_FILE_NAME = "workflow-facade.d.ts"
export const FACADE_DTS = …
export const SNIPPET_FACADE_DTS = FACADE_ARGS_SEGMENT + FACADE_LOG_SEGMENT + FACADE_WORLD_SEGMENT + FACADE_WORLD_RUN_SEGMENT
```

### `apps/cli/packages/dynamic-workflow/src/facade/registry.ts`

导出 16 项（运行时 11 / 纯类型 5），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const WORLD_READ_REGISTRY = …
export type WorldReadOp = (typeof WORLD_READ_REGISTRY)[number]["op"];
export interface ArtifactRow {
  /** 声明该成员的 facade 容器名（恒为 `artifact`）。 */
  readonly container: "artifact";
  /** 容器上的成员名。 */
  readonly member: string;
  /** Boundary A 的 op 名（与成员名相同——产物成员没有 `git.log` 那样的撞名史）。 */
  readonly op: string;
  /**
   * 成员族。`content` 是效应（async、经 driver、可拒绝），`preset` 是声明（同步 void、
   * 不经 driver）。族别决定 lowering 改写成 `publishArtifact` 还是 `declareArtifact`，
   * 也决定超限走节点拒绝还是 failRun，所以它必须和 op 住在同一行里，而不是在三处各判一次。
   */
  readonly family: "content" | "preset";
}
export const ARTIFACT_REGISTRY = …
export type ArtifactOp = (typeof ARTIFACT_REGISTRY)[number]["op"];
export type ArtifactContentOp = Extract<
  (typeof ARTIFACT_REGISTRY)[number],
  { family: "content" }
>["op"];
export type ArtifactPresetOp = Extract<
  (typeof ARTIFACT_REGISTRY)[number],
  { family: "preset" }
>["op"];
export function artifactRowOfSymbol(
  symbol: ts.Symbol | undefined,
): (typeof ARTIFACT_REGISTRY)[number] | undefined
export function artifactFamilyOf(op: ArtifactOp): "content" | "preset"
export function isArtifactPresetOp(op: string): op is ArtifactPresetOp
export function siteProducingFunctionOfSymbol(
  symbol: ts.Symbol | undefined,
): SiteProducingFunction | undefined
export function markerFunctionOfSymbol(symbol: ts.Symbol | undefined): MarkerFunction | undefined
export const SITE_MEMBER_NAMES: ReadonlySet<string> = …
export function isSiteProducing(container: string | undefined, member: string): boolean
export function facadeContainerOf(declaration: ts.Node | undefined): string | undefined
export function worldReadOpOfSymbol(symbol: ts.Symbol | undefined): WorldReadOp | undefined
```

### `apps/cli/packages/dynamic-workflow/src/facade/report-caps.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const REPORT_CAPS = …
```

### `apps/cli/packages/dynamic-workflow/src/facade/world-read-caps.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const WORLD_READ_CAPS = …
```

## lowering（作者面 → host 调用）（2 个文件）

### `apps/cli/packages/dynamic-workflow/src/lowering/index.ts`

导出 5 项（运行时 5 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export { HOST_BINDING } from "./lower.js";
export { lowerWorkflow } from "./lower.js";
export { lowerWorkflowScript } from "./lower.js";
export { LoweredWorkflow } from "./lower.js";
export { LowerResult } from "./lower.js";
```

### `apps/cli/packages/dynamic-workflow/src/lowering/lower.ts`

导出 5 项（运行时 3 / 纯类型 2），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const HOST_BINDING = "__host";
export interface LoweredWorkflow {
  /** lowered 脚本的 async 函数体（顶层 await / 末尾 return 合法；自由标识符仅 `__host`）。 */
  code: string;
  /** 被打桩的 facade site id，按源码顺序（不含 log，它无 site id）。 */
  siteIds: string[];
}
export interface LowerResult {
  diagnostics: CompileDiagnostic[];
  ok: boolean;
  lowered?: LoweredWorkflow;
}
export function lowerWorkflowScript(scriptText: string): LowerResult;
export function lowerWorkflow(workflow: WorkflowProgram, table: SiteTable): LoweredWorkflow;
```

## schema 合成与校验（7 个文件）

### `apps/cli/packages/dynamic-workflow/src/schema/actor-submit-profiles.ts`

导出 4 项（运行时 3 / 纯类型 1），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export type ActorSubmitProfile =
  | { kind: "untyped" }
  | { kind: "mono"; schema: JsonSchema }
  | { kind: "generic" };
export const GENERIC_SUBMIT_PROFILE: ActorSubmitProfile = { kind: "generic" };
export function deriveActorSubmitProfiles(
  graph: SiteGraph,
  askSpecs: ReadonlyMap<string, AskSpec>,
): Map<string, ActorSubmitProfile>;
export function deriveActorSubmitProfilesFor(
  workflow: WorkflowProgram,
  table: SiteTable,
  askSpecs: ReadonlyMap<string, AskSpec>,
): Map<string, ActorSubmitProfile>;
```

### `apps/cli/packages/dynamic-workflow/src/schema/emit.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export class SchemaRejection extends Error {{ … }
export class SchemaEmitter {{ … }
```

### `apps/cli/packages/dynamic-workflow/src/schema/jsdoc.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function harvestConstraints(symbol: ts.Symbol, checker: ts.TypeChecker): Partial<JsonSchema>;
export function mergeConstraints(schema: JsonSchema, extra: Partial<JsonSchema>): JsonSchema;
```

### `apps/cli/packages/dynamic-workflow/src/schema/serialize.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export function serializeSchema(schema: JsonSchema): string;
```

### `apps/cli/packages/dynamic-workflow/src/schema/synthesize.ts`

导出 4 项（运行时 3 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface SchemaSynthesisResult {
  /** 每个有类型 ask 站点的 JSON Schema，按站点 id 归档。 */
  schemas: Record<string, JsonSchema>;
  /** 拒绝性诊断，定位在对应 ask 站点。 */
  diagnostics: CompileDiagnostic[];
}
export function synthesizeAskSchemas(
  workflow: WorkflowProgram,
  table: SiteTable,
): SchemaSynthesisResult;
export function synthesizeWorkflowSchemas(scriptText: string): SchemaSynthesisResult;
export function buildAskSpecs(
  table: SiteTable,
  schemas: Record<string, JsonSchema>,
): Map<string, AskSpec>;
```

### `apps/cli/packages/dynamic-workflow/src/schema/types.ts`

导出 6 项（运行时 2 / 纯类型 4），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "array"
  | "object";
export interface JsonSchema {
  // 结构
  type?: JsonSchemaType | JsonSchemaType[];
  const?: JsonValue;
  enum?: JsonValue[];
  anyOf?: JsonSchema[];
  // object
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  // array / tuple
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  minItems?: number;
  maxItems?: number;
  // string 约束
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  // number 约束
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  // 注解
  description?: string;
  default?: JsonValue;
  // 递归类型：引用与定义表
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}
export interface Violation {
  /** 违规所在位置的 JSON 路径，形如 `$`、`$.foo`、`$.items[0]`。 */
  path: string;
  /** 期望的形状/取值的简短描述。 */
  expected: string;
  /** 实际取到的值的简短描述。 */
  got: string;
}
export const SCHEMA_DIAGNOSTIC_CODE = 9002;
export const MAX_UNION_MEMBERS = 100;
```

### `apps/cli/packages/dynamic-workflow/src/schema/validate.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function validate(schema: JsonSchema, value: unknown): Violation[];
export function formatViolation(violation: Violation): string;
export function formatViolations(violations: readonly Violation[]): string;
```
