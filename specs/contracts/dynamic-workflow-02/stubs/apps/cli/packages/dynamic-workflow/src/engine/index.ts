// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 合同桩：apps/cli/packages/dynamic-workflow/src/engine/index.ts
// 分类 `upstream-modified`。只列 interface.md 的**运行时**导出名（纯类型不进运行时，省略）；
// 末行的 throw 让任何经由这些模块的 import 立刻失败——桩用于「桩替换后契约测试必须全部失败」
// 的验证与替换阶段的起始状态，进入实现后随 stubs/ 一起退役。
// 机器生成：node --import tsx specs/contracts/dynamic-workflow-02/stubs/build-stubs.mjs（勿手改）

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

throw new Error("not implemented: dynamic-workflow-02");
