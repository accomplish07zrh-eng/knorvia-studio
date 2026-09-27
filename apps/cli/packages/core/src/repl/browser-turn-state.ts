// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { SessionId, TurnId } from "@knorvia/contracts";

interface BrowserTurnState {
  candidate?: { browserGeneration: number; browserId: string };
}
// 两层索引保留 session/turn 的精确边界，避免冒号拼接造成跨会话碰撞。
const turns = new Map<SessionId, Map<TurnId, BrowserTurnState>>();
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function recordBrowserTurnToolResult(input: {
  output: unknown;
  sessionId: SessionId;
  toolName: string;
  turnId: TurnId;
}): void {
  if (input.toolName !== "js" && input.toolName !== "mcp__node_repl__js") return;
  const result = object(input.output);
  const meta = object(result?._meta ?? result?.responseMeta);
  const hint = object(meta?.["knorvia/browserTurnScreenshot"]);
  if (
    !hint ||
    typeof hint.browserGeneration !== "number" ||
    !Number.isInteger(hint.browserGeneration) ||
    typeof hint.browserId !== "string"
  )
    return;
  let sessionTurns = turns.get(input.sessionId);
  if (!sessionTurns) {
    sessionTurns = new Map();
    turns.set(input.sessionId, sessionTurns);
  }
  sessionTurns.set(input.turnId, {
    candidate: { browserGeneration: hint.browserGeneration, browserId: hint.browserId },
  });
}
export function clearBrowserTurnState(sessionId: SessionId, turnId: TurnId): void {
  const sessionTurns = turns.get(sessionId);
  if (!sessionTurns) return;
  sessionTurns.delete(turnId);
  if (!sessionTurns.size) turns.delete(sessionId);
}
export function consumeBrowserTurnState(
  sessionId: SessionId,
  turnId: TurnId,
): BrowserTurnState | undefined {
  const result = turns.get(sessionId)?.get(turnId);
  clearBrowserTurnState(sessionId, turnId);
  return result;
}
