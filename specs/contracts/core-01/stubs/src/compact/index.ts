// SPDX-License-Identifier: Apache-2.0
// core-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: core-01");
};

const _unimplementedValue = (): never => notImplemented();
export const buildCompactPrompt = new Proxy({} as never, { get: _unimplementedValue });
export const buildCompactSummaryMessage = new Proxy({} as never, { get: _unimplementedValue });
export const formatCompactSummary = new Proxy({} as never, { get: _unimplementedValue });
export const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const COMPACT_PROMPT_TOO_LONG_USER_MESSAGE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const buildManualCompactBoundary = new Proxy({} as never, { get: _unimplementedValue });
export const createCompactBoundaryId = new Proxy({} as never, { get: _unimplementedValue });
export const estimateMessageTokens = new Proxy({} as never, { get: _unimplementedValue });
export const getMessagesToSummarize = new Proxy({} as never, { get: _unimplementedValue });
export const getUsageTotalTokens = new Proxy({} as never, { get: _unimplementedValue });
export const hasEnoughMessagesToCompact = new Proxy({} as never, { get: _unimplementedValue });
export const AUTOCOMPACT_BUFFER_TOKENS = new Proxy({} as never, { get: _unimplementedValue });
export const DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_COMPACT_CONTEXT_WINDOW = new Proxy({} as never, { get: _unimplementedValue });
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = new Proxy({} as never, { get: _unimplementedValue });
export const getAutoCompactOutputReserveTokens = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const getAutoCompactThreshold = new Proxy({} as never, { get: _unimplementedValue });
export const getEffectiveContextWindowSize = new Proxy({} as never, { get: _unimplementedValue });
export const shouldAutoCompact = new Proxy({} as never, { get: _unimplementedValue });
export const DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const buildDefaultMicrocompactThreshold = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const maybeLocalMicrocompactMessages = new Proxy({} as never, { get: _unimplementedValue });
export const BuildManualCompactBoundaryInput = new Proxy({} as never, { get: _unimplementedValue });
export const CompactModelMessage = new Proxy({} as never, { get: _unimplementedValue });
export const TokenUsageLike = new Proxy({} as never, { get: _unimplementedValue });
export const AutoCompactDecision = new Proxy({} as never, { get: _unimplementedValue });
export const AutoCompactPolicyConfig = new Proxy({} as never, { get: _unimplementedValue });
export const AutoCompactTokenOverride = new Proxy({} as never, { get: _unimplementedValue });
export const AutoCompactTokenSource = new Proxy({} as never, { get: _unimplementedValue });
export const LocalMicrocompactBoundaryPayload = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const LocalMicrocompactDecision = new Proxy({} as never, { get: _unimplementedValue });
export const LocalMicrocompactMessage = new Proxy({} as never, { get: _unimplementedValue });
export const LocalMicrocompactPolicyConfig = new Proxy({} as never, { get: _unimplementedValue });
export const LocalMicrocompactResult = new Proxy({} as never, { get: _unimplementedValue });
