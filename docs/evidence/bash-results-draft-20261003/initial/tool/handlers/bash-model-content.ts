import {
  BashOutputSchema,
  parseImageDataUrl,
  type BashOutput,
  type ModelMessageContent,
} from "@knorvia/contracts";
import { formatPersistedOutputEnvelope } from "../result-persistence-format.js";
import { isBashProviderErrorStatus } from "./bash-semantics.js";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB"];
  let unit = 0;
  let value = bytes / 1024;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1).replace(/\.0$/, "")}${units[unit]}`;
}

function outputBytes(output: BashOutput): number {
  if (typeof output.persistedOutputSize === "number") return output.persistedOutputSize;
  if (typeof output.stdoutPersistedOutputSize === "number"
    || typeof output.stderrPersistedOutputSize === "number") {
    return (output.stdoutPersistedOutputSize ?? 0) + (output.stderrPersistedOutputSize ?? 0);
  }
  return (output.stdoutBytes ?? Buffer.byteLength(output.stdout, "utf8"))
    + (output.stderrBytes ?? Buffer.byteLength(output.stderr, "utf8"));
}

function stdoutText(output: BashOutput): string {
  const stdout = output.stdout ? output.stdout.replace(/^(\s*\n)+/, "").trimEnd() : "";
  if (output.status === "backgrounded") return stdout;
  const path = output.persistedOutputPath ?? output.rawOutputPath;
  if (!path) return stdout;
  return formatPersistedOutputEnvelope({
    content: stdout,
    formatBytes,
    originalBytes: outputBytes(output),
    persistedPath: path,
    previewChars: 2000,
  });
}

function stderrText(output: BashOutput): string {
  const stderr = output.stderr.trim();
  if (!output.interrupted) return stderr;
  return stderr + (stderr ? "\n" : "") + "<error>Command was aborted before completion</error>";
}

function backgroundText(output: BashOutput): string {
  if (!output.backgroundTaskId) return "";
  const path = output.rawOutputPath ?? output.persistedOutputPath
    ?? output.stdoutPersistedOutputPath ?? output.stderrPersistedOutputPath;
  const outputText = path ? ` Output is being written to: ${path}.` : "";
  if (output.assistantAutoBackgrounded) {
    return `Command exceeded the assistant-mode blocking budget (15s) and was moved to the background with ID: ${output.backgroundTaskId}. It is still running — you will be notified when it completes.${outputText} In assistant mode, delegate long-running work to a subagent or use run_in_background to keep this conversation responsive.`;
  }
  if (output.backgroundedByUser) {
    return `Command was manually backgrounded by user with ID: ${output.backgroundTaskId}.${outputText.replace(/\.$/, "")}`;
  }
  const readHint = outputText ? " To check interim output, use Read on that file path." : "";
  return `Command running in background with ID: ${output.backgroundTaskId}.${outputText} You will be notified when it completes.${readHint}`;
}

function textParts(output: BashOutput): string[] {
  return [
    stdoutText(output),
    stderrText(output),
    backgroundText(output),
    output.staleReadFileStateHint?.trim() ?? "",
    output.ghRateLimitHint?.trim() ?? "",
  ];
}

export function formatBashModelContent(output: unknown): ModelMessageContent {
  const parsed = BashOutputSchema.safeParse(output);
  if (!parsed.success) {
    if (typeof output === "string") return output;
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(output);
    } catch {
      return String(output);
    }
    return serialized ?? String(output);
  }
  const data = parsed.data;
  if (Array.isArray(data.structuredContent) && data.structuredContent.length > 0) {
    return data.structuredContent;
  }
  if (isBashOutputProviderError(data)) {
    return [`Exit code ${data.exitCode}`, ...textParts(data)].filter(Boolean).join("\n");
  }
  if (data.isImage) {
    const image = parseImageDataUrl(data.stdout, { allowWhitespace: true });
    if (image) {
      return [{ type: "image", mediaType: image.mediaType, dataUrl: image.dataUrl }];
    }
  }
  return textParts(data).filter(Boolean).join("\n");
}

export function formatPersistedBashModelContent(input: {
  content: string;
  output: unknown;
  persistedPath: string;
  originalBytes: number;
}): ModelMessageContent | undefined {
  if (!BashOutputSchema.safeParse(input.output).success) return undefined;
  return formatPersistedOutputEnvelope({
    content: input.content,
    formatBytes,
    originalBytes: input.originalBytes,
    persistedPath: input.persistedPath,
    previewChars: 2000,
  });
}

export function isBashOutputProviderError(output: unknown): boolean {
  if (output === null || typeof output !== "object" || Array.isArray(output)) return false;
  return isBashProviderErrorStatus(output as Parameters<typeof isBashProviderErrorStatus>[0]);
}
