// SPDX-License-Identifier: Apache-2.0
// 把消息部件投影成给模型的短文本：每种部件一个 formatter，无法投影的返回 null。
// 预览上限按部件种类分开（文本最宽、工具入参最窄），预览一律经 truncateText 收口。
import { type MessagePart } from "@knorvia/contracts";
import { safeJson, truncateText } from "./utils.js";

const TEXT_PREVIEW_LIMIT = 3000;
const FILE_PREVIEW_LIMIT = 1600;
const TOOL_INPUT_PREVIEW_LIMIT = 900;
const TOOL_OUTPUT_PREVIEW_LIMIT = 1600;

// 这些合成来源的内容属于旁路信息，不进上下文。
const SUPPRESSED_SYNTHETIC_SOURCES = new Set(
  "background_task subagent_message diagnostics goal_state_change hook_context model_anomaly queued_system_notification runtime_mode todo_reminder".split(
    " ",
  ),
);

function isSuppressedSyntheticSource(source: unknown): boolean {
  return typeof source === "string" && SUPPRESSED_SYNTHETIC_SOURCES.has(source);
}

// 文件部件：一行头（filename / mime / path 有才写）+ 可选预览正文。
function formatFilePart(part: Extract<MessagePart, { type: "file" }>): string {
  const path = !part.source
    ? undefined
    : part.source.type === "resource"
      ? part.source.uri
      : part.source.path;
  const preview = part.metadata?.preview?.text ?? part.source?.text.value;
  const parts = ["File attachment"];
  if (part.filename) parts.push(`filename=${part.filename}`);
  parts.push(`mime=${part.mime}`);
  if (path) parts.push(`path=${path}`);
  const headerLine = parts.join(" ");
  if (!preview) return headerLine;
  const body = truncateText(preview, FILE_PREVIEW_LIMIT);
  return `${headerLine}\n${body}`;
}

// 工具部件：一行状态头 + 按状态取入参/输出/错误/原始文本。
function formatToolPart(part: Extract<MessagePart, { type: "tool" }>): string {
  const outputLines = [`Tool ${part.tool} ${part.state.status}`];
  if ("input" in part.state) {
    const input = truncateText(safeJson(part.state.input), TOOL_INPUT_PREVIEW_LIMIT);
    outputLines.push(`input: ${input}`);
  }
  if (part.state.status === "completed") {
    const output = truncateText(part.state.output, TOOL_OUTPUT_PREVIEW_LIMIT);
    outputLines.push(`output: ${output}`);
  } else if (part.state.status === "error") {
    const error = truncateText(part.state.error, TOOL_OUTPUT_PREVIEW_LIMIT);
    outputLines.push(`error: ${error}`);
  } else if (part.state.status === "pending") {
    const raw = truncateText(part.state.raw, TOOL_INPUT_PREVIEW_LIMIT);
    outputLines.push(`raw: ${raw}`);
  }
  return outputLines.join("\n");
}

// 文本部件：被忽略、带 system-reminder 标记、或来自被抑制的合成来源时整块不进上下文。
function formatTextPart(part: Extract<MessagePart, { type: "text" }>): string | null {
  if (part.ignored) return null;
  if (/<\/?system-reminder\b/i.test(part.text)) return null;
  if (part.synthetic && isSuppressedSyntheticSource(part.metadata?.source)) return null;
  return truncateText(part.text, TEXT_PREVIEW_LIMIT);
}

function formatSubtaskPart(part: Extract<MessagePart, { type: "subtask" }>): string {
  const lines = [`[Subtask: ${part.description}]`];
  if (part.command) lines.push(`command: ${part.command}`);
  const prompt = truncateText(part.prompt, TEXT_PREVIEW_LIMIT);
  lines.push(`prompt: ${prompt}`);
  return lines.join("\n");
}

// 每种部件一个 formatter；表里没有的种类（reasoning / snapshot / step-start / timeline）返回 null。
const PART_FORMATTERS: Record<string, (part: never) => string | null> = {
  agent: (part: Extract<MessagePart, { type: "agent" }>) => `[Selected agent: ${part.name}]`,
  compaction: (part: Extract<MessagePart, { type: "compaction" }>) =>
    part.timelineText ?? part.reason ?? null,
  file: formatFilePart,
  patch: (part: Extract<MessagePart, { type: "patch" }>) => `Patch files: ${part.files.join(", ")}`,
  retry: (part: Extract<MessagePart, { type: "retry" }>) =>
    `Retry ${part.attempt}: ${part.error.name}`,
  "step-finish": (part: Extract<MessagePart, { type: "step-finish" }>) =>
    `Step finished: ${part.reason}`,
  subtask: formatSubtaskPart,
  text: formatTextPart,
  tool: formatToolPart,
};

export function formatPartForContext(part: MessagePart): string | null {
  const formatter = PART_FORMATTERS[part.type];
  if (!formatter) return null;
  return formatter(part as never);
}

// 同 id 的部件只留最后一个：流式更新会反复产出同一个 id。
export function dedupeParts(parts: MessagePart[]): MessagePart[] {
  const byId = new Map<string, MessagePart>();
  for (const part of parts) byId.set(part.id, part);
  return [...byId.values()];
}
