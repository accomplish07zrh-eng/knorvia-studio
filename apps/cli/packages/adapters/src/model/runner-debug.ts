// SPDX-License-Identifier: Apache-2.0
// 模型 I/O 调试记录：JSONL 逐 attempt 追加（生成式/流式两种 kind）、canonical/SDK 消息拆分、
// delta/baseline 消息压缩、成功生产记录去重、超限瘦身行与 3 文件生产轮转。
// 记录形状、限额与文案由 B54 金样往返锁定，逐字保持；调试失败绝不影响请求结果。

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

const MIB = 1024 * 1024; // 兆字节换算
const DEV_MESSAGE_LIMIT = 256; // 开发环境消息基线上限
const PROD_MESSAGE_LIMIT = 64; // 生产消息基线上限
const DEV_FILE_LIMIT = 256 * MIB; // 开发单文件上限
const PROD_FILE_LIMIT = 64 * MIB; // 生产单文件上限
const PROD_KEEP_FILES = 3; // 生产 .jsonl 保留个数
const SESSION_KEY_SANITIZER = /[^a-zA-Z0-9_.-]+/g;
const RESERVED_SESSION_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const SIZE_LIMIT_REASON = "model-io-record-size-limit";
const messageHistory = new Map<string, unknown[]>(); // 会话键 → 上次 canonical 消息

export function shouldRecordModelIO(environment: EnvRecord): boolean {
  return environment.KNORVIA_RUNTIME_ENV !== "test"; // test runtime 关闭，其余含未设置默认启用
}

export function isDevelopmentModelIOEnv(environment: EnvRecord): boolean {
  return environment.KNORVIA_RUNTIME_ENV === "development";
}

function plainBag(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function splitCanonicalMessages(input: {
  error?: unknown; // 本次错误（决定是否保留 wire 副本）
  isDev: boolean; // 开发环境标记
  modelIoFullRetentionEnabled: boolean; // 全量保留开关
  options: AiSdkGenerateTextOptions; // SDK 选项（wire 副本来源）
  request: AiSdkModelTextRequest; // 逻辑请求（canonical 来源）
}): AiSdkGenerateTextOptions | Record<string, unknown> {
  const keepWireOnly =
    input.modelIoFullRetentionEnabled || input.isDev || input.error !== undefined;
  if (keepWireOnly) return input.options;
  // 失败/开发/全量以外：canonical 上下文进 messages，wire 副本挪到 sdkMessages 供去重删除。
  return {
    ...input.options,
    messages: input.request.messages, // canonical 上下文
    sdkMessages: input.options.messages, // wire 副本
  };
}

function safeSessionFileKey(raw: unknown): string | undefined {
  const text = String(raw ?? "").trim();
  const flattened = text.replace(SESSION_KEY_SANITIZER, "_");
  const key = flattened.slice(0, 160);
  if (!key) return undefined; // 空键不可用
  return RESERVED_SESSION_NAME.test(key) ? `_${key}` : key; // Windows 保留设备名加前缀
}

function sessionKey(call: AiSdkModelTextRequest, fallback: string): string {
  // 会话身份优先取 traceContext，metadata 兼容旧调用方。
  const candidates = [
    call.traceContext?.sessionId,
    call.metadata?.sessionId,
    call.metadata?.session_id,
    call.metadata?.session,
    fallback,
  ];
  for (const candidate of candidates) {
    const key = safeSessionFileKey(candidate);
    if (key) return key;
  }
  return safeSessionFileKey(fallback) ?? "request";
}

function equivalent(head: unknown, tail: unknown): boolean {
  let headJson: string | undefined;
  let tailJson: string | undefined;
  try {
    headJson = JSON.stringify(head);
    tailJson = JSON.stringify(tail);
  } catch {
    return false; // 不可序列化视为不等
  }
  return headJson === tailJson;
}

function deltaPrefix(previous: unknown[], messages: unknown[]): number {
  let shared = 0;
  while (shared < previous.length && equivalent(previous[shared], messages[shared])) shared += 1;
  return shared;
}

function compressMessages(
  session: string,
  container: Record<string, unknown>,
  cap: number,
  continued: boolean,
): unknown[] | undefined {
  const messages = Array.isArray(container.messages) ? container.messages : undefined;
  if (!messages) return undefined;
  const previous = continued ? messageHistory.get(session) : undefined;
  messageHistory.set(session, messages);
  const contiguous = previous !== undefined && previous.length <= messages.length;
  if (contiguous) {
    const shared = deltaPrefix(previous, messages);
    if (shared === previous.length) {
      container.messages = messages.slice(shared);
      container.messageContext = { mode: "delta", retainedPrefix: shared }; // 前缀继承
      return messages;
    }
  }
  const omitted = Math.max(0, messages.length - cap);
  container.messages = messages.slice(-cap);
  container.messageContext = { mode: "baseline", omitted }; // 基线：只留最近 cap 条
  return messages;
}

// 成功记录里成对出现的 wire 副本路径（SDK 消息、请求体消息、响应体）
const WIRE_COPY_PATHS = [
  ["sdkMessages"],
  ["body", "messages"],
  ["request", "body", "messages"],
  ["response", "body"],
] as const;

function deleteAtPath(container: Record<string, unknown>, path: readonly string[]): void {
  let node: Record<string, unknown> | undefined = container;
  for (const key of path.slice(0, -1)) node = plainBag(node?.[key]);
  const leaf = path[path.length - 1];
  if (node) delete node[leaf];
}

function stripWireCopies(container: Record<string, unknown> | undefined): void {
  if (!container) return;
  for (const path of WIRE_COPY_PATHS) deleteAtPath(container, path);
}

function removeSuccessfulProductionDuplicates(record: Record<string, unknown>): void {
  stripWireCopies(plainBag(record.request));
  stripWireCopies(plainBag(record.response));
  const response = plainBag(record.response);
  if (response) delete response.body; // 成功记录不留响应体
  const steps = Array.isArray(response?.steps) ? response.steps : [];
  for (const step of steps) stripWireCopies(plainBag(step));
  const aggregate = plainBag(record.aggregate);
  const settledResponse = plainBag(aggregate?.response);
  const aggregateResponse = plainBag(settledResponse?.value);
  if (aggregateResponse) delete aggregateResponse.body; // 流式响应副本
}

function thinRecord(
  record: Record<string, unknown>,
  originalBytes: number,
): Record<string, unknown> {
  return {
    kind: record.kind, // 记录种类
    attempt: record.attempt, // 物理序号
    startedAt: record.startedAt, // 起始时刻
    completedAt: record.completedAt, // 完成时刻
    providerId: record.providerId, // provider 身份
    modelId: record.modelId, // 模型身份
    error: record.error, // 错误形状
    truncated: { originalBytes, reason: SIZE_LIMIT_REASON }, // 瘦身说明
  };
}

function boundedLine(record: Record<string, unknown>, maxBytes: number): string {
  const line = `${JSON.stringify(record)}\n`;
  const bytes = Buffer.byteLength(line);
  if (bytes < maxBytes) return line;
  return `${JSON.stringify(thinRecord(record, bytes))}\n`;
}

function debugError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    ...Object.fromEntries(Object.entries(error)), // 可枚举自有属性
    name: error.name, // 错误名
    message: error.message, // 错误消息
  };
}

interface JsonlEntry {
  path: string;
  modified: number;
}

async function statJsonl(dir: string, name: string): Promise<JsonlEntry> {
  const path = join(dir, name);
  const details = await stat(path);
  return { path, modified: details.mtimeMs };
}

async function rotateProduction(dir: string, activePath: string): Promise<void> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
  const entries = await Promise.all(names.map((name) => statJsonl(dir, name)));
  const currentExists = entries.some((entry) => entry.path === activePath);
  const removals = Math.max(0, entries.length + (currentExists ? 0 : 1) - PROD_KEEP_FILES);
  const candidates = entries
    .filter((entry) => entry.path !== activePath)
    .sort((left, right) => left.modified - right.modified)
    .slice(0, removals); // 从最旧开始删
  await Promise.allSettled(candidates.map((entry) => unlink(entry.path)));
}

interface WritePlan {
  debugDir?: string;
  error?: unknown;
  fullRetention: boolean;
  isDev: boolean;
  record: Record<string, unknown>;
  request: AiSdkModelTextRequest;
  requestId: string;
}

function messageLimitOf(isDev: boolean): number {
  return isDev ? DEV_MESSAGE_LIMIT : PROD_MESSAGE_LIMIT;
}

function fileLimitOf(isDev: boolean): number {
  return isDev ? DEV_FILE_LIMIT : PROD_FILE_LIMIT;
}

function rebaseAsBaseline(
  record: Record<string, unknown>,
  fullMessages: unknown[],
  limit: number,
): void {
  const request = plainBag(record.request);
  if (!request || !fullMessages) return;
  request.messages = fullMessages.slice(-limit);
  request.messageContext = {
    mode: "baseline",
    omitted: Math.max(0, fullMessages.length - limit),
  };
}

async function write(plan: WritePlan): Promise<void> {
  if (!plan.debugDir) return;
  try {
    await mkdir(plan.debugDir, { recursive: true });
    const key = sessionKey(plan.request, plan.requestId);
    const path = join(plan.debugDir, `${key}.jsonl`);
    if (!plan.fullRetention && !plan.isDev) await rotateProduction(plan.debugDir, path);
    const currentBytes = await stat(path)
      .then((value) => value.size)
      .catch(() => 0);
    const sanitized = sanitizeModelIODebugRecord(plan.record);
    const limit = messageLimitOf(plan.isDev);
    let fullMessages: unknown[] | undefined;
    if (!plan.fullRetention) {
      const request = plainBag(sanitized.request);
      if (request) fullMessages = compressMessages(key, request, limit, currentBytes > 0);
      if (!plan.isDev && plan.error === undefined) removeSuccessfulProductionDuplicates(sanitized);
    }
    if (plan.fullRetention) {
      await appendFile(path, `${JSON.stringify(sanitized)}\n`, "utf8"); // 全量保留原样追加
      return;
    }
    const maxBytes = fileLimitOf(plan.isDev);
    let line = boundedLine(sanitized, maxBytes);
    const wouldOverflow = currentBytes + Buffer.byteLength(line) >= maxBytes;
    if (wouldOverflow) {
      rebaseAsBaseline(sanitized, fullMessages as unknown[], limit);
      line = boundedLine(sanitized, maxBytes);
      await writeFile(path, line, "utf8"); // 超限：baseline 压缩后整文件覆盖
    } else {
      await appendFile(path, line, "utf8");
    }
  } catch {
    /* diagnostics never affect a model request */
  }
}

interface GenerateDebugInput {
  attempt: number; // 物理序号
  debugDir?: string; // 调试/rollout 目录
  error?: unknown; // 本次错误（可缺省）
  isDev: boolean; // 开发环境标记
  modelIoFullRetentionEnabled: boolean; // 全量保留开关
  normalizedToolCalls: ModelTextResult["toolCalls"]; // 归一后的工具调用
  options: AiSdkGenerateTextOptions; // SDK 请求选项（wire 副本来源）
  recordModelIO: boolean; // 环境门（test runtime 为假）
  request: AiSdkModelTextRequest; // 逻辑请求（canonical 来源）
  requestId: string; // 物理请求 id
  resolved: ResolvedAiSdkModel; // 解析结果（身份来源）
  result?: AiSdkGenerateTextResult; // SDK 结果（可缺省）
  startedAt: number; // 起始时刻
}

function generateRecord(input: GenerateDebugInput): Record<string, unknown> {
  return {
    kind: "generate", // 生成式记录（协议面）
    attempt: input.attempt, // 物理序号
    startedAt: input.startedAt, // 起始时刻
    completedAt: Date.now(), // 完成时刻
    providerId: input.resolved.providerId, // provider 身份
    modelId: input.resolved.modelId, // 模型身份
    request: splitCanonicalMessages(input), // canonical/wire 拆分后的请求
    response: input.result, // SDK 结果（可缺省）
    toolCalls: input.normalizedToolCalls, // 归一后的工具调用
    error: debugError(input.error), // 错误形状（可缺省）
    fullRetention: input.modelIoFullRetentionEnabled, // 全量保留标记
    development: input.isDev, // 开发环境标记
  };
}

export function recordGenerateTextDebug(input: GenerateDebugInput): Promise<void> {
  if (!input.recordModelIO || input.request.metadata?.skipTranscript === true) {
    return Promise.resolve();
  }
  return write({
    debugDir: input.debugDir, // 落盘目录
    error: input.error, // 本次错误
    fullRetention: input.modelIoFullRetentionEnabled, // 全量保留开关
    isDev: input.isDev, // 开发环境标记
    request: input.request, // 逻辑请求（会话键来源）
    requestId: input.requestId, // 物理请求 id（会话键兜底）
    record: generateRecord(input),
  });
}

const STREAM_PROMISE_TIMEOUT_MS = 1000; // 流式聚合收敛上限

async function settleStreamResult(result: AiSdkStreamTextResult) {
  return Promise.race([
    Promise.allSettled([
      result.text,
      result.reasoning,
      result.toolResults,
      result.sources,
      result.response,
    ]),
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), STREAM_PROMISE_TIMEOUT_MS),
    ),
  ]);
}

interface StreamAggregate {
  text?: unknown; // 结果文本
  reasoning?: unknown; // 推理输出
  toolResults?: unknown; // 工具结果
  sources?: unknown; // 出处
  response?: unknown; // provider 响应
}

interface StreamDebugInput {
  attempt: number; // 物理序号
  debugDir?: string; // 调试/rollout 目录
  error?: unknown; // 本次错误（可缺省）
  isDev: boolean; // 开发环境标记
  modelIoFullRetentionEnabled: boolean; // 全量保留开关
  normalizedToolCalls: ModelTextResult["toolCalls"]; // 归一后的工具调用
  options: AiSdkStreamTextOptions; // SDK 流选项（wire 副本来源）
  recordModelIO: boolean; // 环境门（test runtime 为假）
  request: AiSdkModelTextRequest; // 逻辑请求
  requestId: string; // 物理请求 id
  resolved: ResolvedAiSdkModel; // 解析结果（身份来源）
  result?: AiSdkStreamTextResult; // SDK 流结果（可缺省）
  startedAt: number; // 起始时刻
  aggregate?: StreamAggregate; // 聚合结果（可缺省）
}

function streamRecord(input: StreamDebugInput): Record<string, unknown> {
  return {
    kind: "stream", // 流式记录（协议面）
    attempt: input.attempt, // 物理序号
    startedAt: input.startedAt, // 起始时刻
    completedAt: Date.now(), // 完成时刻
    providerId: input.resolved.providerId, // provider 身份
    modelId: input.resolved.modelId, // 模型身份
    request: input.options, // wire 选项
    aggregate: input.aggregate, // 聚合结果（可缺省）
    toolCalls: input.normalizedToolCalls, // 归一后的工具调用
    error: debugError(input.error), // 错误形状（可缺省）
    fullRetention: input.modelIoFullRetentionEnabled, // 全量保留标记
    development: input.isDev, // 开发环境标记
  };
}

export async function recordStreamTextDebug(input: StreamDebugInput): Promise<void> {
  if (!input.recordModelIO) return;
  const settled = input.result ? await settleStreamResult(input.result) : undefined;
  const aggregate: StreamAggregate | undefined =
    settled &&
    ({
      text: settled[0], // 结果文本
      reasoning: settled[1], // 推理输出
      toolResults: settled[2], // 工具结果
      sources: settled[3], // 出处
      response: settled[4], // provider 响应
    } as const);
  await write({
    debugDir: input.debugDir, // 落盘目录
    error: input.error, // 本次错误
    fullRetention: input.modelIoFullRetentionEnabled, // 全量保留开关
    isDev: input.isDev, // 开发环境标记
    request: input.request, // 逻辑请求（会话键来源）
    requestId: input.requestId, // 物理请求 id（会话键兜底）
    record: streamRecord({ ...input, aggregate }),
  });
}
