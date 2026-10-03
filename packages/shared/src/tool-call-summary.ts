export type CompactToolCallState =
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

export interface ToolCallSummarySource {
  title?: string;
  kind: string;
  input: unknown;
  output?: unknown;
  raw?: unknown;
}

export interface ToolCallChangeStat {
  added: number;
  removed: number;
}

export interface ToolCallSummary {
  primaryText: string;
  secondaryText?: string;
  changeStat?: ToolCallChangeStat;
}

const statusMessageIds: Record<string, string> = {
  "input-streaming": "chat.toolCall.status.pending",
  "input-available": "chat.toolCall.status.running",
  "output-available": "chat.toolCall.status.completed",
  "output-error": "chat.toolCall.status.failed",
  "output-denied": "chat.toolCall.status.denied",
};

export function isCompactToolCallRunningState(state: string): state is CompactToolCallState {
  return state === "input-streaming" || state === "input-available";
}

export function isCompactToolCallFinishedState(state: string): state is CompactToolCallState {
  return state === "output-available" || state === "output-error" || state === "output-denied";
}

export function getCompactToolCallStatusMessageId(state: string, rawStatus?: string): string {
  if (rawStatus === "stopped") {
    return "chat.toolCall.status.stopped";
  }
  return statusMessageIds[state] ?? "chat.toolCall.status.pending";
}

function normalizeDisplay(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeInput(input: unknown): string | undefined {
  if (typeof input === "string") {
    return normalizeDisplay(input) || undefined;
  }
  if (!isRecord(input)) {
    return undefined;
  }
  for (const key of ["command", "path", "file_path", "filePath", "prompt"]) {
    const candidate = input[key];
    if (typeof candidate === "string") {
      const text = normalizeDisplay(candidate);
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function readTextPair(record: Record<string, unknown>): [string, string] | undefined {
  const before = firstString(record, ["old_string", "oldString", "oldText", "before"]);
  const after = firstString(record, ["new_string", "newString", "newText", "after", "content"]);
  return before !== undefined && after !== undefined ? [before, after] : undefined;
}

function findTextPair(value: unknown): [string, string] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const directPair = readTextPair(value);
  if (directPair !== undefined) {
    return directPair;
  }
  const metadata = value.metadata;
  if (isRecord(metadata)) {
    const fileDiff = metadata.filediff;
    if (isRecord(fileDiff)) {
      const metadataPair = readTextPair(fileDiff);
      if (metadataPair !== undefined) {
        return metadataPair;
      }
    }
  }
  const content = value.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isRecord(block)) {
        const blockPair = readTextPair(block);
        if (blockPair !== undefined) {
          return blockPair;
        }
      }
    }
  }
  return undefined;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lines += 1;
    }
  }
  return text.charCodeAt(text.length - 1) === 10 ? lines - 1 : lines;
}

function getChangeStat(
  kind: string,
  input: unknown,
  output: unknown,
  raw: unknown,
): ToolCallChangeStat | undefined {
  if (!/edit|patch|replace|multi.?edit/i.test(kind)) {
    return undefined;
  }
  const pair = findTextPair(input) ?? findTextPair(output) ?? findTextPair(raw);
  if (pair === undefined) {
    return undefined;
  }
  const removed = countLines(pair[0]);
  const added = countLines(pair[1]);
  return added === 0 && removed === 0 ? undefined : { added, removed };
}

export function getCompactToolCallSummary({
  title,
  kind,
  input,
  output,
  raw,
}: ToolCallSummarySource): ToolCallSummary {
  const changeStat = getChangeStat(kind, input, output, raw);
  const primaryText = (title && normalizeDisplay(title)) || "tool";
  const secondaryText = summarizeInput(input);
  return { primaryText, secondaryText, changeStat };
}
