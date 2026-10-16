// SPDX-License-Identifier: Apache-2.0
// 流式工具输入预览。半截 JSON 只按引号扫描已知字段，不对整段缓冲区做 JSON.parse。

export type KnorviaStreamingToolInputState = {
  deltaCount?: /* 已追加的 delta 次数，缺省当 0 */ number;
  lastPreviewAt?: /* 上次物化的时间戳 */ number;
  lastPreviewRawInputLength?: /* 上次物化时的原始长度，用来算增长 */ number;
  rawInput: /* 已累积的原始 JSON 文本 */ string;
};

export type KnorviaStreamingToolInputPreview = {
  complete: /* 调用方已给完整入参，或整段 JSON 已能解析 */ boolean;
  input: /* 完整值，或按字段目录抽出的部分字符串 */ unknown;
  rawInput: /* 与入参同一份原始文本 */ string;
};

export type KnorviaStreamingToolInputPreviewMode = "active-live" | "background-summary";

const STREAM_THRESHOLDS = {
  eagerDeltaCount: 1,
  activeIntervalMs: 750,
  rawGrowthFloor: 8 * 1024,
  fileIntervalMs: 1000,
} as const;

export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT =
  STREAM_THRESHOLDS.eagerDeltaCount;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS =
  STREAM_THRESHOLDS.activeIntervalMs;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH =
  STREAM_THRESHOLDS.rawGrowthFloor;
export const KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS =
  STREAM_THRESHOLDS.fileIntervalMs;
export const KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT: number =
  STREAM_THRESHOLDS.rawGrowthFloor;

const FILE_PREVIEW_TOOLS = new Set(["write", "edit"]);

const PARTIAL_STRING_FIELD_GROUPS = [
  ["file_path", "filePath", "path"],
  ["target_path", "targetPath", "filename"],
  ["file", "content", "new_string"],
  ["newString", "new_text", "newText"],
  ["old_string", "oldString", "old_text"],
  ["oldText", "command", "description"],
  ["title", "pattern", "replacement"],
  ["plan", "name", "script"],
] as const;

const PARTIAL_STRING_FIELDS = PARTIAL_STRING_FIELD_GROUPS.flat();

const FALLBACK_ESCAPE_PASSES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\n/g, "\n"],
  [/\\r/g, "\r"],
  [/\\t/g, "\t"],
  [/\\"/g, '"'],
  [/\\\\/g, "\\"],
];

const SCAN_PLAIN = "plain";
const SCAN_ESCAPED = "escaped";

type MaterializeOptions = {
  mode?: /* background-summary 先于 eager 否决 */ KnorviaStreamingToolInputPreviewMode;
  now?: /* 测试注入的时钟；缺省才读 Date.now */ number;
  toolName?: /* write/edit 只看文件间隔，不看增长和预算 */ string;
};

interface CapturedString {
  text: string;
  closed: boolean;
}

type JsonRead = { parsed: true; value: unknown } | { parsed: false; reason: string };

function clock(now: number | undefined): number {
  if (now !== undefined) return now;
  return Date.now();
}

function previewOf(
  complete: boolean,
  input: unknown,
  rawInput: string,
): KnorviaStreamingToolInputPreview {
  const preview: KnorviaStreamingToolInputPreview = {
    complete,
    input,
    rawInput,
  };
  return preview;
}

function openingQuoteEnd(raw: string, field: string): number {
  const marker = `"${field}"`;
  let searchFrom = 0;
  while (searchFrom <= raw.length) {
    const at = raw.indexOf(marker, searchFrom);
    if (at < 0) return -1;
    const afterMarker = at + marker.length;
    const separator = /^\s*:\s*"/.exec(raw.slice(afterMarker));
    if (separator) return afterMarker + separator[0].length;
    searchFrom = at + 1;
  }
  return -1;
}

function captureStringBody(raw: string, start: number): CapturedString {
  const chars: string[] = [];
  let cursor = start;
  let mode: typeof SCAN_PLAIN | typeof SCAN_ESCAPED = SCAN_PLAIN;
  while (cursor < raw.length) {
    const character = raw.charAt(cursor);
    cursor += 1;
    if (mode === SCAN_ESCAPED) {
      chars.push(character);
      mode = SCAN_PLAIN;
    } else if (character === '"') {
      return { text: chars.join(""), closed: true };
    } else {
      chars.push(character);
      if (character === "\\") mode = SCAN_ESCAPED;
    }
  }
  return { text: chars.join(""), closed: false };
}

function dropUnfinishedEscape(body: string): string {
  const withoutPartialUnicode = body.replace(/\\u[0-9a-fA-F]{0,3}$/u, "");
  if (!withoutPartialUnicode.endsWith("\\")) return withoutPartialUnicode;
  return withoutPartialUnicode.slice(0, -1);
}

function applyFallbackEscapes(body: string): string {
  let current = body;
  for (const [pattern, replacement] of FALLBACK_ESCAPE_PASSES) {
    current = current.replace(pattern, replacement);
    pattern.lastIndex = 0;
  }
  return current;
}

function parseJsonValue(text: string): JsonRead {
  try {
    // 半截 JSON 抛 SyntaxError。预览调用方只看 parsed，不接收异常。
    return { parsed: true, value: JSON.parse(text) as unknown };
  } catch (syntaxError: unknown) {
    const reason = syntaxError instanceof Error ? syntaxError.name : "SyntaxError";
    return { parsed: false, reason };
  }
}

function decodeCaptured(body: string, closed: boolean): string {
  const prepared = closed ? body : dropUnfinishedEscape(body);
  const quoted = parseJsonValue(`"${prepared}"`);
  if (quoted.parsed && typeof quoted.value === "string") return quoted.value;
  return applyFallbackEscapes(prepared);
}

function collectPartialStrings(rawInput: string): Record<string, string> {
  const extracted: Record<string, string> = {};
  for (const field of PARTIAL_STRING_FIELDS) {
    const contentStart = openingQuoteEnd(rawInput, field);
    if (contentStart >= 0) {
      const captured = captureStringBody(rawInput, contentStart);
      extracted[field] = decodeCaptured(captured.text, captured.closed);
    }
  }
  return extracted;
}

function nextStreamState(
  state: KnorviaStreamingToolInputState | undefined,
  delta: string,
): KnorviaStreamingToolInputState {
  const deltaCount = (state?.deltaCount ?? 0) + 1;
  const rawInput = `${state?.rawInput ?? ""}${delta}`;
  const next: KnorviaStreamingToolInputState = {
    ...state,
    deltaCount,
    rawInput,
  };
  return next;
}

export function appendKnorviaStreamingToolInputDelta(
  state: /* 首个 delta 时没有旧状态 */ KnorviaStreamingToolInputState | undefined,
  delta: /* 本次追加的原始片段 */ string,
): KnorviaStreamingToolInputState {
  return nextStreamState(state, delta);
}

export function buildKnorviaStreamingToolInputPreview(
  rawInput: /* 已累积的原始 JSON 文本 */ string,
  completeInput?: /* 已有完整入参时不再扫描半截字段 */ unknown,
): KnorviaStreamingToolInputPreview {
  if (completeInput !== undefined) return previewOf(true, completeInput, rawInput);
  const whole = parseJsonValue(rawInput);
  if (whole.parsed) return previewOf(true, whole.value, rawInput);
  return previewOf(false, collectPartialStrings(rawInput), rawInput);
}

export function isKnorviaFileStreamingToolInputPreviewTool(toolName?: string): boolean {
  const normalized = typeof toolName === "string" ? toolName.trim().toLowerCase() : "";
  return FILE_PREVIEW_TOOLS.has(normalized);
}

export function shouldMaterializeKnorviaStreamingToolInputPreview(
  state: /* 计数、上次物化时刻与原始长度 */ KnorviaStreamingToolInputState,
  options: MaterializeOptions = {},
): boolean {
  const allowed = options.mode !== "background-summary";
  if (!allowed) return allowed;

  const eager = (state.deltaCount ?? 0) <= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_EAGER_DELTA_COUNT;
  if (eager) return eager;

  const elapsed = clock(options.now) - (state.lastPreviewAt ?? 0);
  const fileTool = isKnorviaFileStreamingToolInputPreviewTool(options.toolName);
  const fileDue = elapsed >= KNORVIA_FILE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS;
  if (fileTool) return fileDue;

  const growth = state.rawInput.length - (state.lastPreviewRawInputLength ?? 0);
  const grownEnough = growth >= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_RAW_GROWTH;
  if (grownEnough) return grownEnough;

  const intervalOpen = elapsed >= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_PREVIEW_MIN_INTERVAL_MS;
  if (!intervalOpen) return intervalOpen;
  const withinBudget =
    state.rawInput.length <= KNORVIA_ACTIVE_STREAMING_TOOL_INPUT_TIME_BUDGET_MAX_RAW_INPUT;
  return withinBudget;
}

export function markKnorviaStreamingToolInputPreviewMaterialized(
  state: /* 就地写下物化戳，供下一轮间隔与增长共用 */ KnorviaStreamingToolInputState,
  now: number = Date.now(),
): void {
  // 间隔与增长共用同一次物化戳。
  Object.assign(state, {
    lastPreviewAt: now,
    lastPreviewRawInputLength: state.rawInput.length,
  });
}
