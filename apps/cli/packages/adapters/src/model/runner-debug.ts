// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { appendFile, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelTextResult } from "@knorvia/contracts";
import type { EnvRecord } from "./model-execution.js";
import type {
  AiSdkGenerateTextOptions,
  AiSdkGenerateTextResult,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  AiSdkStreamTextResult,
  ResolvedAiSdkModel,
} from "./runner-runtime.js";
import { sanitizeModelIODebugRecord } from "./runner-debug-redaction.js";

const MIB = 1024 * 1024;
const priorMessages = new Map<string, unknown[]>();

export function shouldRecordModelIO(env: EnvRecord): boolean {
  return env.KNORVIA_RUNTIME_ENV !== "test";
}
export function isDevelopmentModelIOEnv(env: EnvRecord): boolean {
  return env.KNORVIA_RUNTIME_ENV === "development";
}
function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function generateDebugRequest(input: {
  error?: unknown;
  isDev: boolean;
  modelIoFullRetentionEnabled: boolean;
  options: AiSdkGenerateTextOptions;
  request: AiSdkModelTextRequest;
}): AiSdkGenerateTextOptions | Record<string, unknown> {
  if (input.modelIoFullRetentionEnabled || input.isDev || input.error !== undefined)
    return input.options;
  // canonical 上下文用于 delta/baseline；SDK wire 副本由成功记录去重逻辑删除。
  return {
    ...input.options,
    messages: input.request.messages,
    sdkMessages: input.options.messages,
  };
}
function safeSessionFileKey(value: unknown): string | undefined {
  const key = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .slice(0, 160);
  if (!key) return undefined;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(key) ? `_${key}` : key;
}
function sessionKey(request: AiSdkModelTextRequest, requestId: string): string {
  // traceContext 是当前逻辑会话的权威身份；metadata 仅保留兼容退化路径。
  const value =
    request.traceContext?.sessionId ??
    request.metadata?.sessionId ??
    request.metadata?.session_id ??
    request.metadata?.session ??
    requestId;
  return safeSessionFileKey(value) ?? safeSessionFileKey(requestId) ?? "request";
}
function equivalent(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function compressMessages(
  key: string,
  request: Record<string, unknown>,
  limit: number,
  hasContinuity: boolean,
): unknown[] | undefined {
  const messages = Array.isArray(request.messages) ? request.messages : undefined;
  if (!messages) return undefined;
  const previous = hasContinuity ? priorMessages.get(key) : undefined;
  priorMessages.set(key, messages);
  if (previous && previous.length <= messages.length) {
    let prefix = 0;
    while (prefix < previous.length && equivalent(previous[prefix], messages[prefix])) prefix += 1;
    if (prefix === previous.length) {
      request.messages = messages.slice(prefix);
      request.messageContext = { mode: "delta", retainedPrefix: prefix };
      return messages;
    }
  }
  const omitted = Math.max(0, messages.length - limit);
  request.messages = messages.slice(-limit);
  request.messageContext = { mode: "baseline", omitted };
  return messages;
}
function removeSuccessfulProductionDuplicates(record: Record<string, unknown>): void {
  const trim = (value: unknown) => {
    const container = recordValue(value);
    if (!container) return;
    delete container.sdkMessages;
    const ownBody = recordValue(container.body);
    if (ownBody) delete ownBody.messages;
    const request = recordValue(container.request);
    const requestBody = recordValue(request?.body);
    if (requestBody) delete requestBody.messages;
    const response = recordValue(container.response);
    if (response) delete response.body;
  };
  trim(record.request);
  trim(record.response);
  const response = recordValue(record.response);
  if (response) delete response.body;
  const steps = Array.isArray(response?.steps) ? response.steps : [];
  for (const step of steps) trim(step);
  const aggregate = recordValue(record.aggregate);
  const settledResponse = recordValue(aggregate?.response);
  const aggregateResponse = recordValue(settledResponse?.value);
  if (aggregateResponse) delete aggregateResponse.body;
}
function boundedLine(record: Record<string, unknown>, maxBytes: number): string {
  const line = `${JSON.stringify(record)}\n`;
  const bytes = Buffer.byteLength(line);
  if (bytes < maxBytes) return line;
  return `${JSON.stringify({
    kind: record.kind,
    attempt: record.attempt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    providerId: record.providerId,
    modelId: record.modelId,
    error: record.error,
    truncated: { originalBytes: bytes, reason: "model-io-record-size-limit" },
  })}\n`;
}
function debugError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    ...Object.fromEntries(Object.entries(error)),
    name: error.name,
    message: error.message,
  };
}
async function rotateProduction(debugDir: string, currentPath: string): Promise<void> {
  const names = (await readdir(debugDir)).filter((name) => name.endsWith(".jsonl"));
  const entries = await Promise.all(
    names.map(async (name) => {
      const path = join(debugDir, name);
      return { path, modified: (await stat(path)).mtimeMs };
    }),
  );
  const currentExists = entries.some((entry) => entry.path === currentPath);
  const removals = Math.max(0, entries.length + (currentExists ? 0 : 1) - 3);
  const candidates = entries
    .filter((entry) => entry.path !== currentPath)
    .sort((left, right) => left.modified - right.modified)
    .slice(0, removals);
  await Promise.allSettled(candidates.map((entry) => unlink(entry.path)));
}
async function write(input: {
  debugDir?: string;
  error?: unknown;
  fullRetention: boolean;
  isDev: boolean;
  record: Record<string, unknown>;
  request: AiSdkModelTextRequest;
  requestId: string;
}): Promise<void> {
  if (!input.debugDir) return;
  try {
    await mkdir(input.debugDir, { recursive: true });
    const key = sessionKey(input.request, input.requestId);
    const path = join(input.debugDir, `${key}.jsonl`);
    if (!input.fullRetention && !input.isDev) await rotateProduction(input.debugDir, path);
    const currentBytes = await stat(path)
      .then((value) => value.size)
      .catch(() => 0);
    const sanitized = sanitizeModelIODebugRecord(input.record);
    let fullMessages: unknown[] | undefined;
    const messageLimit = input.isDev ? 256 : 64;
    if (!input.fullRetention) {
      const request = recordValue(sanitized.request);
      if (request) fullMessages = compressMessages(key, request, messageLimit, currentBytes > 0);
      if (!input.isDev && input.error === undefined)
        removeSuccessfulProductionDuplicates(sanitized);
    }
    if (input.fullRetention) {
      await appendFile(path, `${JSON.stringify(sanitized)}\n`, "utf8");
      return;
    }
    const maxBytes = (input.isDev ? 256 : 64) * MIB;
    let line = boundedLine(sanitized, maxBytes);
    if (currentBytes + Buffer.byteLength(line) >= maxBytes) {
      const request = recordValue(sanitized.request);
      if (request && fullMessages) {
        request.messages = fullMessages.slice(-messageLimit);
        request.messageContext = {
          mode: "baseline",
          omitted: Math.max(0, fullMessages.length - messageLimit),
        };
        line = boundedLine(sanitized, maxBytes);
      }
      await writeFile(path, line, "utf8");
    } else await appendFile(path, line, "utf8");
  } catch {
    /* diagnostics never affect a model request */
  }
}
export function recordGenerateTextDebug(input: {
  attempt: number;
  debugDir?: string;
  error?: unknown;
  isDev: boolean;
  modelIoFullRetentionEnabled: boolean;
  normalizedToolCalls: ModelTextResult["toolCalls"];
  options: AiSdkGenerateTextOptions;
  recordModelIO: boolean;
  request: AiSdkModelTextRequest;
  requestId: string;
  resolved: ResolvedAiSdkModel;
  result?: AiSdkGenerateTextResult;
  startedAt: number;
}): Promise<void> {
  if (!input.recordModelIO || input.request.metadata?.skipTranscript === true)
    return Promise.resolve();
  return write({
    debugDir: input.debugDir,
    error: input.error,
    fullRetention: input.modelIoFullRetentionEnabled,
    isDev: input.isDev,
    request: input.request,
    requestId: input.requestId,
    record: {
      kind: "generate",
      attempt: input.attempt,
      startedAt: input.startedAt,
      completedAt: Date.now(),
      providerId: input.resolved.providerId,
      modelId: input.resolved.modelId,
      request: generateDebugRequest(input),
      response: input.result,
      toolCalls: input.normalizedToolCalls,
      error: debugError(input.error),
      fullRetention: input.modelIoFullRetentionEnabled,
      development: input.isDev,
    },
  });
}
export async function recordStreamTextDebug(input: {
  attempt: number;
  debugDir?: string;
  error?: unknown;
  isDev: boolean;
  modelIoFullRetentionEnabled: boolean;
  normalizedToolCalls: ModelTextResult["toolCalls"];
  options: AiSdkStreamTextOptions;
  recordModelIO: boolean;
  request: AiSdkModelTextRequest;
  requestId: string;
  resolved: ResolvedAiSdkModel;
  result?: AiSdkStreamTextResult;
  startedAt: number;
}): Promise<void> {
  if (!input.recordModelIO) return;
  const settled = !input.result
    ? undefined
    : await Promise.race([
        Promise.allSettled([
          input.result.text,
          input.result.reasoning,
          input.result.toolResults,
          input.result.sources,
          input.result.response,
        ]),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
      ]);
  const aggregate = settled && {
    text: settled[0],
    reasoning: settled[1],
    toolResults: settled[2],
    sources: settled[3],
    response: settled[4],
  };
  await write({
    debugDir: input.debugDir,
    error: input.error,
    fullRetention: input.modelIoFullRetentionEnabled,
    isDev: input.isDev,
    request: input.request,
    requestId: input.requestId,
    record: {
      kind: "stream",
      attempt: input.attempt,
      startedAt: input.startedAt,
      completedAt: Date.now(),
      providerId: input.resolved.providerId,
      modelId: input.resolved.modelId,
      request: input.options,
      aggregate,
      toolCalls: input.normalizedToolCalls,
      error: debugError(input.error),
      fullRetention: input.modelIoFullRetentionEnabled,
      development: input.isDev,
    },
  });
}
