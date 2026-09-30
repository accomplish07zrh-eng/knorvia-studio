// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  KnorviaMessageWithParts,
  KnorviaSessionSettingsState,
  KnorviaSessionStateSnapshot,
  ModelSelection,
} from "@knorvia/shared";

export function projectionUrl(): string {
  return process.env.KNORVIA_UI_B3_LIB_DIR
    ? pathToFileURL(
        resolve(
          process.env.KNORVIA_UI_B3_LIB_DIR,
          `sessionProjection.${process.env.KNORVIA_UI_B3_LIB_EXT ?? "ts"}`,
        ),
      ).href
    : new URL("../src/lib/sessionProjection.js", import.meta.url).href;
}

export function settings(): KnorviaSessionSettingsState {
  return {
    model: { current: { providerId: "provider", modelId: "default" }, available: [] },
    mode: { current: "build" },
    thoughtLevel: { enabled: false, available: [] },
  };
}

export function message(
  role: "user" | "assistant",
  id: string,
  text = "",
  model?: ModelSelection,
): KnorviaMessageWithParts {
  const common = {
    messageId: id,
    sessionId: "fixture-session",
    role,
    agent: "fixture-agent",
    time: { created: 10 },
    ...(model === undefined ? {} : { model }),
  };
  return {
    info:
      role === "user"
        ? { ...common, role }
        : {
            ...common,
            role,
            parentMessageId: "fixture-parent",
            path: { cwd: "/synthetic", root: "/synthetic" },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
    parts: text
      ? [
          {
            type: "text",
            text,
            partId: `${id}-text`,
            messageId: id,
            sessionId: "fixture-session",
          },
        ]
      : [],
  };
}

export function snapshot(): KnorviaSessionStateSnapshot {
  return {
    protocol: { name: "Knorvia Studio Protocol", version: 1 },
    session: {
      sessionId: "fixture-session",
      title: " Fixture title ",
      sessionKind: "interactive",
      mode: "build",
      status: "idle",
      workspace: { workspacePath: "/synthetic/workspace", workspaceKey: "fixture-key" },
      createdAt: 10,
      updatedAt: 20,
    },
    settings: settings(),
    projection: {
      sessionId: "fixture-session",
      mode: "build",
      status: "idle",
      turnCount: 0,
      totalTokenCount: 0,
      contextUsed: 0,
      contextWindow: 0,
      pendingPermissions: [],
      activeToolCalls: [],
      backgroundJobs: [],
    },
    runtime: { eventSeq: 0, stateRevision: 0, pendingRequestIds: [] },
    messages: [],
  };
}

export function runtimeValue<T>(value: unknown): T {
  return value as T;
}

export function withoutTrace<T extends { traceId: string }>(value: T): Omit<T, "traceId"> {
  const { traceId: _traceId, ...rest } = value;
  return rest;
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key], seen);
    Object.freeze(value);
  }
  return value;
}
