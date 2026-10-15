// SPDX-License-Identifier: Apache-2.0
// 工具入参归一：字符串按 JSON 解析、解析失败回退空对象并 warn 一次；
// 非字符串原样放行（null 归一为空对象）。告警文案与字段是既有日志面，逐字保持。

import type { Logger } from "@knorvia/contracts";

interface DecodeContext {
  logger?: Logger;
  source: "generateText" | "streamText";
  toolName?: string;
}

type DecodeOutcome = { ok: true; value: unknown } | { ok: false; error: unknown };

function tryDecode(raw: string): DecodeOutcome {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (failure) {
    return { ok: false, error: failure };
  }
}

function decodePayload(raw: string, context: DecodeContext): unknown {
  const outcome = tryDecode(raw);
  if (outcome.ok) return outcome.value ?? {};
  context.logger?.warn("Invalid model tool input; using an empty object", {
    source: context.source,
    toolName: context.toolName,
    error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
  });
  return {}; // 解析失败的统一回退：调用方拿到空对象继续装配。
}

export function normalizeModelToolInput(payload: unknown, context: DecodeContext): unknown {
  if (payload === undefined || payload === "") return {};
  if (typeof payload !== "string") return payload ?? {};
  return decodePayload(payload, context);
}
