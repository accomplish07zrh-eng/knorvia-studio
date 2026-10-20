// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 自动压缩阈值的口径换算。
//
// 旧内核算阈值分三步（`core/src/compact/policy.ts` 与 `policy-internal.ts` 的冻结常量）：
//   窗口 200000、输出预留请求 32000、输出预留上限 21000、缓冲 13000
//   有效窗口 = 窗口 − min(预留请求, 预留上限) = 200000 − 21000 = 179000
//   阈值     = 有效窗口 − 缓冲 = 179000 − 13000 = 166000
//
// DSH 的 `dsh-compaction-basic` 换了一套旋钮：窗口占比 `thresholdRatio`、绝对余量
// `headroomTokens`、请求输出预留 `maxTokens`。它对一次请求算压力水位的公式是
//   min(窗口 × 占比, 窗口 − 输出预留 − 余量)
// 两边相减的顺序不同，所以不能把旧内核的「缓冲」直接当余量、把「预留」丢掉——
// 只有同时给足输出预留与缓冲，两边才落在同一个 token 数上（166000）。
//
// 契约见 specs/contracts/kernel-dsh-builtins/interface.md §六（B18）、known-differences.md D4。

/** 旧内核默认上下文窗口（`DEFAULT_COMPACT_CONTEXT_WINDOW`）。 */
export const LEGACY_CONTEXT_WINDOW = 200_000;
/** 旧内核输出预留请求（`DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS`）。 */
export const LEGACY_OUTPUT_RESERVE_REQUEST = 32_000;
/** 旧内核输出预留上限（`policy.ts` 的 `OUTPUT_RESERVE_CAP_TOKENS`）。 */
export const LEGACY_OUTPUT_RESERVE_CEILING = 21_000;
/** 旧内核压缩缓冲（`AUTOCOMPACT_BUFFER_TOKENS`）。 */
export const LEGACY_BUFFER_TOKENS = 13_000;

/**
 * 旧内核的有效窗口：窗口扣掉输出预留，预留本身先压到上限以内。
 *
 * @param windowSize - 上下文窗口大小。
 * @param reserveRequest - 输出预留请求值。
 * @returns 有效窗口，不小于 0。
 */
export function legacyEffectiveWindow(windowSize: number, reserveRequest: number): number {
  const reserved = Math.min(reserveRequest, LEGACY_OUTPUT_RESERVE_CEILING);
  return Math.max(0, windowSize - reserved);
}

/**
 * 旧内核的自动压缩阈值：有效窗口再扣掉缓冲。
 *
 * @param windowSize - 上下文窗口大小。
 * @param reserveRequest - 输出预留请求值。
 * @param buffer - 缓冲余量。
 * @returns 触发压缩的 token 水位，不小于 0。
 */
export function legacyAutoCompactThreshold(
  windowSize: number,
  reserveRequest: number,
  buffer: number,
): number {
  return Math.max(0, legacyEffectiveWindow(windowSize, reserveRequest) - buffer);
}

/**
 * 某个窗口下压缩配置不可用的原因。DSH 在配置/请求期拒绝加载，本包用同一个判据
 * 让调用方能在 boot 之前发现（known-differences D4b）。
 */
export class CompressionWindowError extends Error {
  /**
   * @param windowSize - 出问题的上下文窗口。
   * @param reason - 为什么这个窗口容不下当前配置。
   */
  constructor(windowSize: number, reason: string) {
    super(`compression config is unusable at a ${windowSize}-token window: ${reason}`);
    this.name = "CompressionWindowError";
  }
}

/**
 * DSH 对一次请求算出的压力水位。参数含义按 `dsh-compaction-basic` 的解析顺序：
 * 先扣输出预留得到消息预算，再扣余量得到压力预算，最后与窗口占比取小。
 *
 * 三处与 DSH 同构的硬约束（DSH 在那里分别抛 `TargetPressureConfigError`）：
 * 消息预算必须为正、压力预算必须为正、结果必须为正。这里显式抛错而不是返回
 * 负数或 0，因为"阈值为 0"在旧内核里意味着永不自动压缩，和 DSH 的拒绝加载
 * 是两种截然不同的产品行为（known-differences D4b）。
 *
 * @param input.windowSize - 适配器给出的上下文窗口。
 * @param input.reservedCompletionTokens - 该请求预留的输出 token（对应 `maxTokens`）。
 * @param input.headroomTokens - 绝对余量（对应 `headroomTokens`）。
 * @param input.thresholdRatio - 窗口占比（对应 `thresholdRatio`）。
 * @returns 触发压缩的 token 水位，必为正。
 * @throws CompressionWindowError 当窗口容不下输出预留加余量时。
 */
export function dshPressureThreshold(input: {
  readonly windowSize: number;
  readonly reservedCompletionTokens: number;
  readonly headroomTokens: number;
  readonly thresholdRatio: number;
}): number {
  const messageBudget = input.windowSize - input.reservedCompletionTokens;
  if (messageBudget <= 0) {
    throw new CompressionWindowError(
      input.windowSize,
      `reserving ${input.reservedCompletionTokens} completion tokens leaves no message budget`,
    );
  }
  const pressureBudget = messageBudget - input.headroomTokens;
  if (pressureBudget <= 0) {
    throw new CompressionWindowError(
      input.windowSize,
      `reserving ${input.reservedCompletionTokens} output and ${input.headroomTokens} headroom tokens leaves no pressure budget`,
    );
  }
  const threshold = Math.floor(Math.min(input.windowSize * input.thresholdRatio, pressureBudget));
  if (threshold <= 0) {
    throw new CompressionWindowError(input.windowSize, "resolved threshold is not positive");
  }
  return threshold;
}

/** 旧内核预算链里一个可判定的节点：名字、取值与它来自哪一侧的口径。 */
export interface CompressionBudget {
  /** 该节点在旧内核里的名字。 */
  readonly name: string;
  /** 该节点的 token 数。 */
  readonly tokens: number;
}

/**
 * 旧内核的预算链，按计算顺序排列。测试与验收文档用它核对每个节点都落了地，
 * 而不只是核对最终那一个数。
 *
 * @param windowSize - 上下文窗口大小。
 * @param reserveRequest - 输出预留请求值。
 * @param buffer - 缓冲余量。
 * @returns 三个节点：有效窗口、缓冲、阈值。
 */
export function legacyBudgetChain(
  windowSize: number,
  reserveRequest: number,
  buffer: number,
): CompressionBudget[] {
  const effective = legacyEffectiveWindow(windowSize, reserveRequest);
  return [
    { name: "effectiveWindow", tokens: effective },
    { name: "buffer", tokens: buffer },
    { name: "autoCompactThreshold", tokens: Math.max(0, effective - buffer) },
  ];
}

/**
 * 本包在组合里使用的压缩配置；值与 `dsh-compaction-basic` 的 `config` 形状一致。
 * `thresholdRatio` 取 1，让窗口占比不成为更紧的那一侧；真正决定水位的是
 * 「窗口 − 输出预留 − 缓冲」。
 */
export interface KernelCompressionConfig {
  /** 窗口占比上限；取 1 表示不额外收紧。 */
  readonly thresholdRatio: number;
  /** 绝对余量，对应旧内核的压缩缓冲。 */
  readonly headroomTokens: number;
  /** 请求输出预留，对应旧内核预留请求压到上限后的值。 */
  readonly maxTokens: number;
  /** 新检查点之后保留的工作集比例（DSH 自己的语义，不是旧内核的微压缩水位）。 */
  readonly retainRatio: number;
  /** 是否启用自动压缩。 */
  readonly auto: boolean;
  /** 压缩失败后的重试次数。 */
  readonly compactionRetries: number;
  /** 溢出的重试次数。 */
  readonly maxOverflowRetries: number;
  /** 小窗口模型的单独配置位；本包留空，由后续包按模型填。 */
  readonly modelPolicies: readonly unknown[];
}

/** 默认窗口下的目标阈值，与旧内核对齐：166000。 */
export const KERNEL_AUTO_COMPACT_THRESHOLD = legacyAutoCompactThreshold(
  LEGACY_CONTEXT_WINDOW,
  LEGACY_OUTPUT_RESERVE_REQUEST,
  LEGACY_BUFFER_TOKENS,
);

/**
 * 组合里实际写入的压缩配置。三个数一起决定水位：
 * 200000 − 21000（输出预留）− 13000（缓冲）= 166000，与旧内核同值。
 */
export const KERNEL_COMPRESSION_CONFIG: KernelCompressionConfig = {
  thresholdRatio: 1,
  headroomTokens: LEGACY_BUFFER_TOKENS,
  maxTokens: LEGACY_OUTPUT_RESERVE_CEILING,
  retainRatio: 0.16,
  auto: true,
  compactionRetries: 1,
  maxOverflowRetries: 1,
  modelPolicies: [],
};

/**
 * 把本包配置与一个具体窗口对起来，算它在该窗口下的压力水位。
 * 小窗口模型由调用方给出自己的窗口，公式不变；窗口容不下配置时抛错，
 * 这与 DSH 在配置期拒绝加载同构（known-differences D4b）。
 *
 * @param config - 组合里的压缩配置。
 * @param windowSize - 该模型的上下文窗口。
 * @returns 该窗口下的压力水位，必为正。
 * @throws CompressionWindowError 当该窗口容不下输出预留加余量时。
 */
export function pressureThresholdFor(config: KernelCompressionConfig, windowSize: number): number {
  return dshPressureThreshold({
    windowSize,
    reservedCompletionTokens: config.maxTokens,
    headroomTokens: config.headroomTokens,
    thresholdRatio: config.thresholdRatio,
  });
}

/**
 * 当前配置能接受的最小窗口：恰好容下输出预留与余量、且水位为正的那个窗口。
 * 小于它的模型必须由 `modelPolicies` 单独覆盖（规格「能力映射」原文：
 * 小窗口模型必须单独配置）。README 与验收文档引用这个数。
 *
 * @param config - 组合里的压缩配置。
 * @returns 最小可用窗口（token）。
 */
export function minimumUsableWindow(config: KernelCompressionConfig): number {
  // 压力预算 = 窗口 − 预留 − 余量 必须 > 0，因此窗口至少是两者之和加 1。
  return config.maxTokens + config.headroomTokens + 1;
}
