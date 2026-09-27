// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ErrorAttribution } from "@knorvia/contracts";
import type { Frame } from "./frames.js";
import { code, scalar, text } from "./text.js";

type Context = Record<string, unknown>;
type Attribute = keyof ErrorAttribution;
const ENUMS = {
  errorPhase: [
    "prepare",
    "configuration",
    "connect",
    "response",
    "stream",
    "parse",
    "validation",
    "unhandled",
  ],
  exceptionKind: [
    "api_call",
    "generic",
    "protocol",
    "provider_business",
    "transport",
    "type_error",
    "validation",
  ],
  transport: ["http", "sse", "websocket"],
  source: ["provider", "runtime", "tool", "network"],
} as const;
const ATTRIBUTE_ORDER: readonly Attribute[] = [
  "source",
  "reason",
  "errorPhase",
  "exceptionKind",
  "providerId",
  "modelId",
  "providerKind",
  "transport",
  "statusCode",
  "providerErrorCode",
  "retryable",
];
const DETAIL_FIELDS = [
  ["provider", "providerId", "provider"],
  ["provider_code", "providerCode"],
  ["model", "modelId", "model"],
  ["request", "requestId"],
  ["code", "code"],
  ["reason", "reason"],
  ["status", "statusCode", "status"],
  ["retryable", "retryable"],
] as const;

function first<T>(
  contexts: readonly Context[],
  keys: readonly string[],
  convert: (value: unknown) => T | undefined,
): T | undefined {
  for (const context of contexts)
    for (const key of keys) {
      const value = convert(context[key]);
      if (value !== undefined) return value;
    }
  return undefined;
}

function nearestText(contexts: readonly Context[], ...keys: string[]): string | undefined {
  return first(contexts, keys, (value) => text(value, "tag"));
}

function enumText(contexts: readonly Context[], key: keyof typeof ENUMS): string | undefined {
  const value = nearestText(contexts, key);
  // 外层非空但非法的枚举值会挡住内层值；不能把验证塞进 first 的逐层筛选。
  return value !== undefined && (ENUMS[key] as readonly string[]).includes(value)
    ? value
    : undefined;
}

function status(contexts: readonly Context[]): number | undefined {
  for (const context of contexts) {
    const value = context.statusCode ?? context.status;
    if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599)
      return value;
  }
  return undefined;
}

function retryable(contexts: readonly Context[], frames: readonly Frame[]): boolean | undefined {
  let selected: boolean | undefined;
  for (const context of contexts) {
    if (typeof context.retryable !== "boolean") continue;
    selected = context.retryable;
    break;
  }
  // getter 检查与取值之间可能失效；先完成上下文选择，再执行原有的帧级 nullish 回退。
  return (
    selected ?? frames.find((frame) => !frame.wrapper && frame.retryable !== undefined)?.retryable
  );
}

export function attribution(frames: readonly Frame[]): ErrorAttribution | undefined {
  const contexts = frames.flatMap((frame) => (frame.data ? [frame.data] : []));
  const values: Partial<Record<Attribute, unknown>> = {};
  values.reason = nearestText(contexts, "reason");
  values.errorPhase = enumText(contexts, "errorPhase");
  values.exceptionKind = enumText(contexts, "exceptionKind");
  values.providerId = nearestText(contexts, "providerId", "provider");
  values.modelId = nearestText(contexts, "modelId", "model");
  values.providerKind = nearestText(contexts, "providerKind");
  values.transport = enumText(contexts, "transport");
  values.statusCode = status(contexts);
  values.providerErrorCode =
    first(contexts, ["providerCode"], (value) => text(code(value), "tag")) ??
    frames.find((frame) => /^\d+$/.test(frame.code ?? ""))?.code;
  values.retryable = retryable(contexts, frames);
  values.source = enumText(contexts, "source");
  const result: Partial<Record<Attribute, unknown>> = {};
  for (const key of ATTRIBUTE_ORDER) if (values[key] !== undefined) result[key] = values[key];
  // 封闭字段协议仅由上面对应的转换器写入，false 等有效值不经 truthiness 丢弃。
  return Object.keys(result).length ? (result as ErrorAttribution) : undefined;
}

export function contextDetail(context: Context | undefined): string | undefined {
  if (!context) return undefined;
  const parts: string[] = [];
  for (const [label, primary, ...aliases] of DETAIL_FIELDS) {
    let value = context[primary];
    for (const key of aliases) if (value === null || value === undefined) value = context[key];
    const rendered = scalar(value);
    if (rendered !== undefined) parts.push(`${label}=${rendered}`);
  }
  return parts.length ? parts.join(" ") : undefined;
}
