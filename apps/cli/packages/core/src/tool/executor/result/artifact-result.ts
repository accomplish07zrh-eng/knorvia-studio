// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { TraceContext, ModelMessageContent } from "@knorvia/contracts";
import type { ToolEntry } from "../../types.js";
import type { ToolExecutorDeps } from "../types.js";
import { formatGenericPersistedOutputContent } from "../../result-persistence-format.js";
import type { SizedOutput } from "./serialization-policy.js";

export async function saveResult(
  deps: ToolExecutorDeps,
  facts: SizedOutput,
  entry: ToolEntry,
  trace: TraceContext,
  toolCallId: string,
  signal: AbortSignal,
): Promise<{ path?: string; uri: string } | undefined> {
  if (!facts.save || !deps.artifactStore) return undefined;
  try {
    return await deps.artifactStore.writeToolResultArtifact(
      {
        sessionId: deps.sessionId,
        turnId: trace.turnId ?? deps.turnId,
        toolCallId,
        toolName: entry.metadata.name,
        content: facts.text,
        contentType: facts.contentType,
        retention: facts.budget.artifact?.retention ?? "session",
        trace,
      },
      { signal },
    );
  } catch {
    // 保持既有契约：存储拒绝与取消不改变工具本身的成功状态，由输出策略选定回退。
    return undefined;
  }
}
export function savedPreview(
  facts: SizedOutput,
  entry: ToolEntry,
  output: unknown,
  persistedPath: string,
): ModelMessageContent {
  const custom = entry.formatPersistedModelContent?.({
    content: facts.text,
    originalBytes: facts.bytes,
    output,
    persistedPath,
  });
  return custom === undefined
    ? formatGenericPersistedOutputContent({
        content: facts.text,
        originalBytes: facts.bytes,
        persistedPath,
      })
    : custom;
}
