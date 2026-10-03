import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  KnorviaModelTrajectory,
  KnorviaModelTrajectoryCallSource,
  KnorviaModelTrajectoryContentPart,
  KnorviaModelTrajectoryMessage,
  KnorviaModelTrajectoryRecord,
  KnorviaModelTrajectoryUsage,
} from "#src/session/taskService.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  readTrajectoryFileTail,
  resolveModelIODirs,
  sanitizeSessionSegment,
} from "#src/agent/modelTrajectoryFileTail.js";
import type { TrajectoryFileTail } from "#src/agent/modelTrajectoryFileTail.js";

// model-io 默认最多返回的调用条数（保留最近 N 条），避免长 session 把 UI 压垮。
const DEFAULT_TRAJECTORY_LIMIT = 200;
const SESSION_TITLE_PROMPT_PREFIX = "Generate a concise title for this coding session.";
const logger = createServiceLogger("model-trajectory");

/**
 * 解析 ~/.knorvia-studio/cli/{debug,rollout} 下的 model-io JSONL，按 sessionId 还原某个 task 的模型调用轨迹。
 *
 * 设计说明：
 * - model-io 由 adapters/model/runner-debug.ts 落盘；一个 session 一个
 *   `model-io-<sanitizedSessionId>.jsonl`。
 * - Knorvia Agent 把 taskId 当作 sessionId（见 taskServiceAdapter），所以这里只读取
 *   该 session 的单文件，并按 `record.sessionId === taskId` 精确匹配。
 */
export async function readModelTrajectory(
  taskId: string,
  limit = DEFAULT_TRAJECTORY_LIMIT,
): Promise<KnorviaModelTrajectory> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 200;
  const sourceFiles: string[] = [];
  const rawRecords: TrajectoryRawRecord[] = [];
  let inputTruncated = false;
  const sanitized = sanitizeSessionSegment(taskId);
  const dirs = resolveModelIODirs();

  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }

    const name = `model-io-${sanitized || "no-session"}.jsonl`;
    if (!names.includes(name)) continue;
    const filePath = join(dir, name);
    const startedAt = Date.now();
    let tail: TrajectoryFileTail;
    try {
      tail = await readTrajectoryFileTail(filePath);
      logger.debug(
        undefined,
        `read taskId=${taskId} bytes=${tail.bytesRead} truncated=${tail.truncated} durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      logger.debug(undefined, `read failed taskId=${taskId} file=${filePath}`, error);
      continue;
    }

    inputTruncated ||= tail.truncated;
    let matchedInFile = false;
    for (const line of tail.text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: TrajectoryRawRecord;
      try {
        parsed = JSON.parse(trimmed) as TrajectoryRawRecord;
      } catch {
        continue;
      }
      if (parsed.type === "model_io" && parsed.sessionId === taskId) {
        rawRecords.push(parsed);
        matchedInFile = true;
      }
    }
    if (matchedInFile) sourceFiles.push(filePath);
  }

  rawRecords.sort((left, right) => {
    const difference = toTime(asString(left.startedAt)) - toTime(asString(right.startedAt));
    if (difference !== 0) return difference;
    return (asString(left.requestId) ?? "").localeCompare(asString(right.requestId) ?? "");
  });

  const expandedRecords = expandTrajectoryRecords(rawRecords);
  const records = expandedRecords.map(mapTrajectoryRecord);
  const truncated = inputTruncated || records.length > safeLimit;
  const trimmedRecords = truncated ? records.slice(records.length - safeLimit) : records;
  return { taskId, available: true, records: trimmedRecords, sourceFiles, truncated };
}

type TrajectoryRawRecord = Record<string, unknown>;

type TrajectoryMessageTool = {
  toolCallId?: string;
  toolName?: string;
  isError: boolean;
};

function expandTrajectoryRecords(records: TrajectoryRawRecord[]): TrajectoryRawRecord[] {
  const expanded: TrajectoryRawRecord[] = [];
  let previous: TrajectoryRawRecord | undefined;
  for (const record of records) {
    const next = expandTrajectoryRecord(record, previous);
    expanded.push(next);
    previous = next;
  }
  return expanded;
}

function expandTrajectoryRecord(
  record: TrajectoryRawRecord,
  previous: TrajectoryRawRecord | undefined,
): TrajectoryRawRecord {
  const request = asObject(record.request);
  if (!request) return record;
  return {
    ...record,
    request: expandTrajectoryRequest(request, asObject(previous?.request)),
  };
}

function expandTrajectoryRequest(
  request: TrajectoryRawRecord,
  previousRequest: TrajectoryRawRecord | undefined,
): TrajectoryRawRecord {
  const next = { ...request };
  expandTrajectoryCollection(next, previousRequest, "messages", "messagesKind", "messageOffset");
  expandTrajectoryCollection(
    next,
    previousRequest,
    "sdkMessages",
    "sdkMessagesKind",
    "sdkMessageOffset",
  );
  const body = asObject(next.body);
  if (body) {
    const nextBody = { ...body };
    expandTrajectoryCollection(
      nextBody,
      asObject(previousRequest?.body),
      "messages",
      "bodyMessagesKind",
      "bodyMessageOffset",
      next,
    );
    next.body = nextBody;
  }
  return next;
}

function expandTrajectoryCollection(
  target: TrajectoryRawRecord,
  previous: TrajectoryRawRecord | undefined,
  collectionKey: string,
  kindKey: string,
  offsetKey: string,
  metadataSource: TrajectoryRawRecord = target,
): void {
  if (metadataSource[kindKey] === "tail") return;
  if (metadataSource[kindKey] !== "delta") return;
  const delta = target[collectionKey];
  const prior = previous?.[collectionKey];
  const offset = asNonNegativeInteger(metadataSource[offsetKey]);
  if (!Array.isArray(delta) || !Array.isArray(prior) || offset === undefined) return;
  target[collectionKey] = [...prior.slice(0, offset), ...delta];
}

function mapTrajectoryRecord(record: TrajectoryRawRecord): KnorviaModelTrajectoryRecord {
  const request = asObject(record.request);
  const response = asObject(record.response);
  const model = asObject(record.model);
  const error = asObject(record.error);
  const querySource = asString(record.querySource) ?? inferTrajectoryQuerySource(request);
  const modelRole = asString(model?.role);
  const mapped: KnorviaModelTrajectoryRecord = {
    requestId: asString(record.requestId) ?? "",
    attempt: asNumber(record.attempt) ?? 1,
    startedAt: asString(record.startedAt) ?? "",
    completedAt: asString(record.completedAt),
    durationMs: asNumber(record.durationMs),
    turnId: asString(record.turnId),
    traceId: asString(record.traceId),
    callSource: classifyTrajectoryCallSource(querySource, modelRole),
    model: {
      modelId: asString(model?.modelId),
      providerId: asString(model?.providerId),
      role: modelRole,
      source: asString(model?.source),
    },
    request: {
      messages: mapTrajectoryMessages(request?.messages),
      toolNames: asStringArray(request?.toolNames),
    },
  };
  if (response) {
    const responseToolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    mapped.response = {
      finishReason: asString(response.finishReason),
      text: asString(response.text),
      reasoningText: asString(response.reasoningText),
      toolCalls: (responseToolCalls as unknown[]).map(mapTrajectoryResponseToolCall),
      usage: mapTrajectoryUsage(response.usage),
      responseId: asString(response.responseId),
      modelId: asString(response.modelId),
    };
  }
  if (error && (asString(error.message) || asString(error.name))) {
    mapped.error = {
      name: asString(error.name) ?? "Error",
      message: asString(error.message) ?? "",
      stack: asString(error.stack),
    };
  }
  return mapped;
}

function inferTrajectoryQuerySource(request: TrajectoryRawRecord | undefined): string | undefined {
  const messages = request?.messages;
  if (!Array.isArray(messages)) return undefined;
  const first = asObject(messages[0]);
  if (first?.role === "system") {
    const content = asString(first.content);
    if (content?.startsWith(SESSION_TITLE_PROMPT_PREFIX)) return "session_title";
  }
  return undefined;
}

function classifyTrajectoryCallSource(
  querySource: string | undefined,
  modelRole: string | undefined,
): KnorviaModelTrajectoryCallSource {
  if (querySource === "main_turn") return { kind: "main", querySource };
  if (querySource === "subagent") return { kind: "subagent", querySource };
  if (querySource === "compact" || modelRole === "compact") return { kind: "compact", querySource };
  if (querySource) return { kind: "sidecar", querySource };
  if (modelRole === "subagent") return { kind: "subagent" };
  return { kind: "main" };
}

function mapTrajectoryMessages(value: unknown): KnorviaModelTrajectoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const message = asObject(entry) ?? {};
    const role = asString(message.role) ?? "unknown";
    return {
      role,
      parts: mapTrajectoryContent(message.content, role, {
        toolCallId:
          asString(message.toolCallId) ??
          asString(message.tool_call_id) ??
          asString(message.tool_use_id),
        toolName: asString(message.toolName) ?? asString(message.name),
        isError: message.isError === true || message.is_error === true,
      }),
    };
  });
}

function mapTrajectoryContent(
  content: unknown,
  role: string,
  messageTool?: TrajectoryMessageTool,
): KnorviaModelTrajectoryContentPart[] {
  if (typeof content === "string") {
    if (content.length === 0) return [];
    if (role === "tool") {
      return [
        {
          kind: "tool-result",
          toolCallId: messageTool?.toolCallId,
          toolName: messageTool?.toolName,
          output: tryParseTrajectoryJson(content, messageTool?.isError),
        },
      ];
    }
    return [{ kind: "text", text: content }];
  }
  if (!Array.isArray(content)) return [];
  return content.map((part) => mapTrajectoryPart(part, role === "tool" ? messageTool : undefined));
}

function tryParseTrajectoryJson(value: string, isError?: boolean): unknown {
  if (isError) return { type: "error-text", value };
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapTrajectoryPart(
  raw: unknown,
  messageTool?: TrajectoryMessageTool,
): KnorviaModelTrajectoryContentPart {
  const part = asObject(raw);
  if (!part) return { kind: "unknown", raw };
  switch (part.type) {
    case "text":
      return { kind: "text", text: asString(part.text) ?? "" };
    case "reasoning":
      return { kind: "reasoning", text: asString(part.text) ?? "" };
    case "tool-call":
      return {
        kind: "tool-call",
        toolCallId: asString(part.toolCallId),
        toolName: asString(part.toolName) ?? "tool",
        input: part.input ?? part.args,
      };
    case "tool-result":
      return {
        kind: "tool-result",
        toolCallId: asString(part.toolCallId) ?? messageTool?.toolCallId,
        toolName: asString(part.toolName) ?? messageTool?.toolName,
        output: part.output ?? part.result,
      };
    case "image":
    case "file":
      return { kind: "image", mediaType: asString(part.mediaType) };
    default:
      return { kind: "unknown", raw };
  }
}

function mapTrajectoryResponseToolCall(raw: unknown): KnorviaModelTrajectoryContentPart {
  const call = asObject(raw);
  if (!call) return { kind: "unknown", raw };
  return {
    kind: "tool-call",
    toolCallId: asString(call.id) ?? asString(call.toolCallId),
    toolName: asString(call.name) ?? asString(call.toolName) ?? "tool",
    input: call.input ?? call.args,
  };
}

function mapTrajectoryUsage(value: unknown): KnorviaModelTrajectoryUsage | undefined {
  const usage = asObject(value);
  if (!usage) return undefined;
  return {
    inputTokens: asNumber(usage.inputTokens),
    outputTokens: asNumber(usage.outputTokens),
    totalTokens: asNumber(usage.totalTokens),
    cacheReadTokens: asNumber(usage.cacheReadTokens),
    reasoningTokens: asNumber(usage.reasoningTokens),
  };
}

function toTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function asObject(value: unknown): TrajectoryRawRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TrajectoryRawRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
