// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { timingSafeEqual } from "node:crypto";
import type { ComputerUseRuntimeExecuteInput } from "@knorvia/cua";
import { textField } from "./request-context.js";

const INVALID_REQUEST = "Invalid broker request";
const UNPRINTABLE_ERROR = "Computer Use broker request failed";

/** Authentication precedes correlation: unauthenticated input cannot select a response id. */
export function authenticatedEnvelope(raw: unknown, credential: Buffer): Record<string, unknown> {
  if (raw === null || typeof raw !== "object") throw new Error(INVALID_REQUEST);
  const envelope = raw as Record<string, unknown>;
  const supplied = Buffer.from(typeof envelope.token === "string" ? envelope.token : "");
  if (supplied.length !== credential.length || !timingSafeEqual(supplied, credential)) {
    throw new Error("Computer Use broker request is not authorized");
  }
  return envelope;
}

/** Preserve extension fields; downstream runtime remains the authority for device methods. */
export function computerRequest(
  envelope: Record<string, unknown>,
): Omit<ComputerUseRuntimeExecuteInput, "signal"> {
  if (typeof envelope.id !== "string" || typeof envelope.method !== "string") {
    throw new Error(INVALID_REQUEST);
  }
  const context = envelope.context as Record<string, unknown> | undefined;
  if (!context || !textField(context, "sessionId")) {
    throw new Error("Computer Use request context is missing sessionId");
  }
  if (context.runtimeScope === "subagent")
    throw new Error("Computer Use is not available in subagent");
  const workspaceKey = ["workspaceKey", "workspaceIdentity", "workspacePath"]
    .map((key) => textField(context, key))
    .find((key) => key !== undefined);
  if (!workspaceKey) throw new Error("Computer Use request context is missing workspaceKey");
  return {
    toolName: envelope.method,
    arguments: envelope.input,
    context: { ...context, workspaceKey } as ComputerUseRuntimeExecuteInput["context"],
  };
}

function diagnostic(error: unknown): string {
  try {
    const text: unknown = error instanceof Error ? error.message : String(error);
    if (typeof text === "string") return text;
  } catch {
    // 空原型抛出值会让旧 String(error) 再次抛错并终止宿主；错误归一化必须闭合。
  }
  return UNPRINTABLE_ERROR;
}

export function computerFailureLine(id: unknown, error: unknown): string {
  return JSON.stringify({ id, ok: false, error: diagnostic(error) }) + "\n";
}
