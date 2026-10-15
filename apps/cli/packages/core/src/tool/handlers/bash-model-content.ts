// SPDX-License-Identifier: Apache-2.0
// bash 输出的模型内容投影：把执行结果折算成回灌模型的文本块或图片块。
// 文本由四段组成（stdout、stderr、后台说明、两类提示），出错时前置退出码行；
// 大输出的信封格式与预览长度在此固定。
import {
  BashOutputSchema,
  parseImageDataUrl,
  type BashOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import { formatPersistedOutputEnvelope } from "../result-persistence-format.js";
import { isBashProviderErrorStatus } from "./bash-semantics.js";

const BYTE_UNIT_STEP = 1024;
const BYTE_UNIT_LABELS = ["KB", "MB", "GB"];
const PERSISTED_PREVIEW_CHARS = 2000;
const ABORTED_STDERR_TAG = "<error>Command was aborted before completion</error>";
const LEADING_BLANK_LINES = /^(\s*\n)+/u;
const TRAILING_ZERO_DECIMAL = /\.0$/u;
// 后台说明的文案片段：自动转后台、手动转后台、常规后台三种情形各自拼装。
const ARTIFACT_WRITE_NOTE = " Output is being written to: ";
const AUTO_MOVED_PREFIX =
  "Command exceeded the assistant-mode blocking budget (15s) and was moved to the background with ID: ";
const AUTO_MOVED_STILL_RUNNING = ". It is still running — you will be notified when it completes.";
const AUTO_MODE_ADVICE =
  " In assistant mode, delegate long-running work to a subagent or use run_in_background to keep this conversation responsive.";
const USER_BACKGROUNDED_PREFIX = "Command was manually backgrounded by user with ID: ";
const BACKGROUND_RUNNING_PREFIX = "Command running in background with ID: ";
const COMPLETION_NOTICE = " You will be notified when it completes.";
const INTERIM_OUTPUT_HINT = " To check interim output, use Read on that file path.";

function humanByteSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 bytes";
  if (size < BYTE_UNIT_STEP) return `${size} bytes`;
  let magnitude = 0;
  let scaled = size / BYTE_UNIT_STEP;
  while (scaled >= BYTE_UNIT_STEP && magnitude < BYTE_UNIT_LABELS.length - 1) {
    scaled /= BYTE_UNIT_STEP;
    magnitude += 1;
  }
  return `${scaled.toFixed(1).replace(TRAILING_ZERO_DECIMAL, "")}${BYTE_UNIT_LABELS[magnitude]}`;
}

function persistedByteTotal(view: BashOutput): number {
  if (typeof view.persistedOutputSize === "number") return view.persistedOutputSize;
  const splitSizes = view.stdoutPersistedOutputSize ?? view.stderrPersistedOutputSize;
  if (typeof splitSizes === "number") {
    const stdoutPart = view.stdoutPersistedOutputSize ?? 0;
    const stderrPart = view.stderrPersistedOutputSize ?? 0;
    return stdoutPart + stderrPart;
  }
  const stdoutBytes = view.stdoutBytes ?? Buffer.byteLength(view.stdout, "utf8");
  const stderrBytes = view.stderrBytes ?? Buffer.byteLength(view.stderr, "utf8");
  return stdoutBytes + stderrBytes;
}

function renderStdout(view: BashOutput): string {
  const trimmedStdout = view.stdout ? view.stdout.replace(LEADING_BLANK_LINES, "").trimEnd() : "";
  if (view.status === "backgrounded") return trimmedStdout;
  const artifact = view.persistedOutputPath ?? view.rawOutputPath;
  if (!artifact) return trimmedStdout;
  const envelope = formatPersistedOutputEnvelope({
    content: trimmedStdout,
    formatBytes: humanByteSize,
    originalBytes: persistedByteTotal(view),
    persistedPath: artifact,
    previewChars: PERSISTED_PREVIEW_CHARS,
  });
  return envelope;
}

function renderStderr(view: BashOutput): string {
  const trimmedStderr = view.stderr.trim();
  if (!view.interrupted) return trimmedStderr;
  const separator = trimmedStderr ? "\n" : "";
  return trimmedStderr + separator + ABORTED_STDERR_TAG;
}

function renderBackgroundNotice(view: BashOutput): string {
  const taskId = view.backgroundTaskId;
  if (!taskId) return "";
  const candidates = [
    view.rawOutputPath,
    view.persistedOutputPath,
    view.stdoutPersistedOutputPath,
    view.stderrPersistedOutputPath,
  ];
  const artifact = candidates.find((path) => path !== undefined);
  const artifactNote = artifact ? `${ARTIFACT_WRITE_NOTE}${artifact}.` : "";
  if (view.assistantAutoBackgrounded) {
    return `${AUTO_MOVED_PREFIX}${taskId}${AUTO_MOVED_STILL_RUNNING}${artifactNote}${AUTO_MODE_ADVICE}`;
  }
  if (view.backgroundedByUser) {
    const noteWithoutPeriod = artifactNote.replace(/\.$/u, "");
    return `${USER_BACKGROUNDED_PREFIX}${taskId}.${noteWithoutPeriod}`;
  }
  const interimHint = artifactNote ? INTERIM_OUTPUT_HINT : "";
  return `${BACKGROUND_RUNNING_PREFIX}${taskId}.${artifactNote}${COMPLETION_NOTICE}${interimHint}`;
}

function composeTextSections(view: BashOutput): string[] {
  return [
    renderStdout(view),
    renderStderr(view),
    renderBackgroundNotice(view),
    view.staleReadFileStateHint?.trim() ?? "",
    view.ghRateLimitHint?.trim() ?? "",
  ];
}

export function formatBashModelContent(payload: unknown): ModelMessageContent {
  const validated = BashOutputSchema.safeParse(payload);
  if (!validated.success) return fallbackTextFor(payload);
  const view = validated.data;
  if (Array.isArray(view.structuredContent) && view.structuredContent.length > 0) {
    return view.structuredContent as ModelMessageContent;
  }
  if (isBashOutputProviderError(view)) {
    return [`Exit code ${view.exitCode}`, ...composeTextSections(view)].filter(Boolean).join("\n");
  }
  if (view.isImage) {
    const decoded = parseImageDataUrl(view.stdout, { allowWhitespace: true });
    if (decoded) {
      return [{ type: "image", mediaType: decoded.mediaType, dataUrl: decoded.dataUrl }];
    }
  }
  return composeTextSections(view).filter(Boolean).join("\n");
}

// schema 不认的输入：字符串原样回灌，其余先试 JSON 序列化再退 String()。
function fallbackTextFor(payload: unknown): ModelMessageContent {
  if (typeof payload === "string") return payload;
  return safeSerialize(payload);
}

function safeSerialize(payload: unknown): ModelMessageContent {
  try {
    return JSON.stringify(payload) ?? String(payload);
  } catch {
    return String(payload);
  }
}

export function formatPersistedBashModelContent(envelopeInput: {
  output: unknown;
  persistedPath: string;
  originalBytes: number;
  content: string;
}): ModelMessageContent | undefined {
  if (!BashOutputSchema.safeParse(envelopeInput.output).success) return undefined;
  const rendered = formatPersistedOutputEnvelope({
    content: envelopeInput.content,
    formatBytes: humanByteSize,
    originalBytes: envelopeInput.originalBytes,
    persistedPath: envelopeInput.persistedPath,
    previewChars: PERSISTED_PREVIEW_CHARS,
  });
  return rendered;
}

export function isBashOutputProviderError(view: unknown): boolean {
  if (view === null || typeof view !== "object" || Array.isArray(view)) return false;
  return isBashProviderErrorStatus(view as Parameters<typeof isBashProviderErrorStatus>[0]);
}
