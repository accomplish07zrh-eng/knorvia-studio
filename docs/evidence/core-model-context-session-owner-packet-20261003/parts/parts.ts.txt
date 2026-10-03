import { type MessagePart } from "@knorvia/contracts";
import { safeJson, truncateText } from "./utils.js";

const TEXT_PART_PREVIEW_CHARS = 3000;
const FILE_PART_PREVIEW_CHARS = 1600;
const TOOL_INPUT_PREVIEW_CHARS = 900;
const TOOL_OUTPUT_PREVIEW_CHARS = 1600;

function isSuppressedSyntheticSource(source: unknown): boolean {
  if (typeof source !== "string") return false;
  switch (source) {
    case "background_task":
    case "subagent_message":
    case "diagnostics":
    case "goal_state_change":
    case "hook_context":
    case "model_anomaly":
    case "queued_system_notification":
    case "runtime_mode":
    case "todo_reminder":
      return true;
    default:
      return false;
  }
}

function formatFile(part: Extract<MessagePart, { type: "file" }>): string {
  const path = !part.source
    ? undefined
    : part.source.type === "resource"
      ? part.source.uri
      : part.source.path;
  const preview = part.metadata?.preview?.text ?? part.source?.text.value;
  const header = [
    "File attachment",
    part.filename ? `filename=${part.filename}` : undefined,
    `mime=${part.mime}`,
    path ? `path=${path}` : undefined,
  ].filter(Boolean).join(" ");
  if (!preview) return header;
  return `${header}\n${truncateText(preview, FILE_PART_PREVIEW_CHARS)}`;
}

function formatTool(part: Extract<MessagePart, { type: "tool" }>): string {
  const lines = [`Tool ${part.tool} ${part.state.status}`];
  if ("input" in part.state) {
    lines.push(`input: ${truncateText(safeJson(part.state.input), TOOL_INPUT_PREVIEW_CHARS)}`);
  }
  if (part.state.status === "completed") {
    lines.push(`output: ${truncateText(part.state.output, TOOL_OUTPUT_PREVIEW_CHARS)}`);
  } else if (part.state.status === "error") {
    lines.push(`error: ${truncateText(part.state.error, TOOL_OUTPUT_PREVIEW_CHARS)}`);
  } else if (part.state.status === "pending") {
    lines.push(`raw: ${truncateText(part.state.raw, TOOL_INPUT_PREVIEW_CHARS)}`);
  }
  return lines.join("\n");
}

export function formatPartForContext(part: MessagePart): string | null {
  switch (part.type) {
    case "text":
      if (part.ignored) return null;
      if (/<\/?system-reminder\b/i.test(part.text)) return null;
      if (part.synthetic && isSuppressedSyntheticSource(part.metadata?.source)) return null;
      return truncateText(part.text, TEXT_PART_PREVIEW_CHARS);
    case "file":
      return formatFile(part);
    case "agent":
      return `[Selected agent: ${part.name}]`;
    case "subtask":
      return [
        `[Subtask: ${part.description}]`,
        part.command ? `command: ${part.command}` : undefined,
        `prompt: ${truncateText(part.prompt, TEXT_PART_PREVIEW_CHARS)}`,
      ].filter(Boolean).join("\n");
    case "tool":
      return formatTool(part);
    case "patch":
      return `Patch files: ${part.files.join(", ")}`;
    case "compaction":
      return part.timelineText ?? part.reason ?? null;
    case "retry":
      return `Retry ${part.attempt}: ${part.error.name}`;
    case "step-finish":
      return `Step finished: ${part.reason}`;
    case "reasoning":
    case "snapshot":
    case "step-start":
    case "timeline":
      return null;
  }
}

export function dedupeParts(parts: MessagePart[]): MessagePart[] {
  return Array.from(new Map(parts.map((part) => [part.id, part] as const)).values());
}
