// SPDX-License-Identifier: Apache-2.0

/*
 * 本地 TTFT 观测的纯数据表：阶段序、分桶边界、上限与线上枚举取值。
 * 这里只放字面量，不做派生；schema 构造、校准与时间读取在 localTtft.ts。
 */

/** 六段流水线：顺序即因果顺序，缺失段落由导出侧据此判定。 */
export const LOCAL_TTFT_STAGES = [
  "renderer_prepare",
  "command_admission",
  "execution_wait",
  "request_prepare",
  "model_request",
  "output_return",
] as const;

/** 请求准备阶段的子步骤，按真实执行顺序排列。 */
export const LOCAL_TTFT_PREPARATION_STAGES = [
  "context",
  "hooks",
  "persistence",
  "compaction",
  "mcp",
  "tools",
  "request_assembly",
] as const;

/** 分桶上界（毫秒），升序。 */
export const LOCAL_TTFT_BUCKETS_MS: number[] = [
  1, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 300_000,
];

/** 详情条数上限。 */
export const LOCAL_TTFT_MAX_DETAILS = 64;

/** 待聚合记录上限。 */
export const LOCAL_TTFT_MAX_PENDING = 128;

/** 观测记录保留时长（毫秒）。 */
export const LOCAL_TTFT_TTL_MS = 300_000;

/** 时钟校准允许的最大网络误差（毫秒）。 */
export const LOCAL_TTFT_CLOCK_MAX_ERROR_MS = 10;

/** 时钟校准结果的有效期（毫秒）。 */
export const LOCAL_TTFT_CLOCK_TTL_MS = 60_000;

/** 详情窗口在准备阶段之外额外接受的阶段。 */
export const LOCAL_TTFT_DETAIL_EXTRA_STAGES = [
  "attempt",
  "retry_wait",
  "user_confirmation",
] as const;

/** facts 与 record 共用的归一化标识字段：缺省即不参与聚合。 */
export const NORMALIZED_ID_FIELDS = [
  "sessionId",
  "turnId",
  "productTurnId",
  "queryId",
  "requestId",
  "logicalCallId",
  "cliVersion",
  "provider",
  "model",
] as const;

/** 详情窗口的 outcome 取值。 */
export const DETAIL_OUTCOMES = {
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  firstOutput: "first_output",
} as const;

/** 详情窗口属于请求侧还是准备侧。 */
export const DETAIL_ROLES = {
  response: "response",
  preparation: "preparation",
} as const;

/** 采样来源：renderer 侧自带时间，CLI 侧事件由主进程补齐。 */
export const OBSERVATION_SOURCES = {
  renderer: "renderer",
  cli: "cli",
} as const;

/** 首个输出片段的类型，决定「首个 token」按哪一类内容计时。 */
export const OUTPUT_KINDS = {
  text: "text",
  reasoning: "reasoning",
  tool: "tool",
} as const;

/** 输入投递方式：立即执行、排队或由引导流程注入。 */
export const SEND_MODES = {
  idle: "idle",
  queued: "queued",
  guided: "guided",
} as const;

/** facts 的终态集合。 */
export const TERMINAL_OUTCOMES = {
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  rejected: "rejected",
  interrupted: "interrupted",
} as const;

/** facts 被排除在统计外的原因。 */
export const EXCLUSION_REASONS = {
  busy: "busy",
  retry: "retry",
  unsupported: "unsupported",
  failed: "failed",
  capacity: "capacity",
} as const;

/** 区间来源：两侧各自的时间戳，或已经对齐后的合成区间。 */
export const ALIGNED_SOURCES = {
  renderer: "renderer",
  cli: "cli",
  aligned: "aligned",
} as const;

/** 单条记录的种类：起点、首次输出、无文本、被排除或检查点。 */
export const RECORD_KINDS = {
  start: "start",
  firstOutput: "first_output",
  firstText: "first_text",
  noText: "no_text",
  excluded: "excluded",
  checkpoint: "checkpoint",
} as const;

/**
 * 单条记录的终局。resync 来自桌面 continuous 缓冲溢出/投影重建后的 online snapshot；
 * 不是手机 replayable 恢复链路，两者不能混用。
 */
export const RECORD_OUTCOMES = {
  success: "success",
  busy: "busy",
  retry: "retry",
  unsupported: "unsupported",
  failed: "failed",
  cancelled: "cancelled",
  background: "background",
  expired: "expired",
  capacity: "capacity",
  recovery: "recovery",
  resync: "resync",
  clockInvalid: "clock_invalid",
  rejected: "rejected",
  interrupted: "interrupted",
  guided: "guided",
  unclosed: "unclosed",
} as const;

/** 记录质量：完整、缺段或时钟不可信。 */
export const RECORD_QUALITIES = {
  complete: "complete",
  missing: "missing",
  clockInvalid: "clock_invalid",
} as const;

/** 可见性快照的三种状态。 */
export const VISIBILITY_STATES = {
  foreground: "foreground",
  background: "background",
  backgroundReturned: "background_returned",
} as const;
