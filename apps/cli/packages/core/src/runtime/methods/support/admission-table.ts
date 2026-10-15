// SPDX-License-Identifier: Apache-2.0
// 流式工具准入判定与 delta 记账：准入是一张「否决理由表」——七条否决理由任一命中就不许流中
// 启动，其余留给流末统一执行。delta 记账按 UTF-8 字节数累计。
import type { ModelToolCall } from "../../deps.js";

/** 流式工具执行模式的缺省档（逐字常量）。 */
export const STREAMING_TOOL_EXECUTION_MODE = "readOnly";

/** 声明副本表。 */
export type DeclarationMap = Map<string, ModelToolCall>;

/** 注册表条目的最小视图（元数据 + 权限 + 交互标记）。 */
export interface ToolRegistryEntry {
  /** 元数据（准入七条件的事实来源）。 */
  metadata: {
    concurrentSafe: boolean;
    destructive: boolean;
    needsApproval: boolean;
    readOnly: boolean;
    requiresUserInteraction?: boolean;
    sideEffectScope: string;
    mcpPresentation?: unknown;
  };
  /** 权限覆盖（sideEffectScope 优先于元数据）。 */
  permission?: { sideEffectScope?: string };
  /** 交互标记覆盖。 */
  requiresUserInteraction?: boolean;
}

/** 准入判定的最小运行时视图。 */
export interface AdmissionRuntime {
  /** 运行配置（流式开关与执行档）。 */
  config: { modelStreaming?: string; streamingToolExecution?: string };
  /** 工具注册表。 */
  registry: {
    get(name: string): ToolRegistryEntry | undefined;
    getMetadata?(name: string): unknown;
  };
}

/** 否决理由判定：返回理由串即否决，undefined 即本条放行。 */
type VetoCheck = (runtime: AdmissionRuntime, toolCall: ModelToolCall) => string | undefined;

/** 声明副本是否 provider 自执行。 */
const providerExecutedVeto: VetoCheck = (_runtime, toolCall) =>
  toolCall.providerExecuted ? "provider_executed" : undefined;

/** 工具名不能为空白。 */
const blankNameVeto: VetoCheck = (_runtime, toolCall) =>
  toolCall.name.trim().length === 0 ? "blank_name" : undefined;

/** 流式总开关必须显式打开。 */
const streamingSwitchVeto: VetoCheck = (runtime) =>
  runtime.config.modelStreaming === "on" ? undefined : "streaming_disabled";

/** 执行档 off 即否决（缺省按 readOnly 放行）。 */
const executionModeVeto: VetoCheck = (runtime) => {
  const mode = runtime.config.streamingToolExecution ?? STREAMING_TOOL_EXECUTION_MODE;
  return mode === "off" ? "execution_off" : undefined;
};

/** 注册表必须有该工具。 */
const registrationVeto: VetoCheck = (runtime, toolCall) =>
  runtime.registry.get(toolCall.name) === undefined ? "unregistered" : undefined;

/** 元数据四条件：只读、并发安全、非破坏、免审批。 */
const metadataVeto: VetoCheck = (runtime, toolCall) => {
  const facts = runtime.registry.get(toolCall.name)?.metadata;
  if (!facts) return "unregistered";
  const acceptable =
    facts.readOnly && facts.concurrentSafe && !facts.destructive && !facts.needsApproval;
  return acceptable ? undefined : "metadata_veto";
};

/** 副作用范围必须 none（权限声明优先）且不需要用户交互。 */
const sideEffectVeto: VetoCheck = (runtime, toolCall) => {
  const entry = runtime.registry.get(toolCall.name);
  if (!entry) return "unregistered";
  const scope = entry.permission?.sideEffectScope ?? entry.metadata.sideEffectScope;
  const interactive = entry.requiresUserInteraction ?? entry.metadata.requiresUserInteraction;
  return scope === "none" && !interactive ? undefined : "side_effect_or_interaction";
};

/** 否决理由表：顺序即检查顺序，任一命中即停。 */
const VETO_CHECKS: readonly VetoCheck[] = [
  providerExecutedVeto,
  blankNameVeto,
  streamingSwitchVeto,
  executionModeVeto,
  registrationVeto,
  metadataVeto,
  sideEffectVeto,
];

/** 是否允许流中启动执行：七条理由全不命中才放行。 */
export function permitsStreamingLaunch(
  runtime: AdmissionRuntime,
  toolCall: ModelToolCall,
): boolean {
  return VETO_CHECKS.every((check) => check(runtime, toolCall) === undefined);
}

/** UTF-8 字节计数（delta 记账口径）。 */
export const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).byteLength;

/** 丢弃字节计数器：推理与文本各一列，只增不减。 */
export interface DiscardedByteCounter {
  /** 累计推理 delta 字节。 */
  recordReasoningDelta(text: string): void;
  /** 累计文本 delta 字节。 */
  recordTextDelta(text: string): void;
  /** 当前丢弃的推理字节数。 */
  reasoningBytes(): number;
  /** 当前丢弃的文本字节数。 */
  textBytes(): number;
}

/** 建一个丢弃字节计数器。 */
export function createDiscardedByteCounter(): DiscardedByteCounter {
  const totals = { reasoning: 0, text: 0 };
  return {
    recordReasoningDelta(text) {
      totals.reasoning += utf8ByteLength(text);
    },
    recordTextDelta(text) {
      totals.text += utf8ByteLength(text);
    },
    reasoningBytes() {
      return totals.reasoning;
    },
    textBytes() {
      return totals.text;
    },
  };
}
