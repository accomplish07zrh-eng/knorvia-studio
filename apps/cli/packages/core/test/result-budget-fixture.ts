// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolArtifactStorePort, TraceContext } from "@knorvia/contracts";
import type { ToolEntry, ToolResultSerialization } from "../src/tool/types.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";

export const trace = { traceId: "trace-fixture", turnId: "trace-turn" } as TraceContext;
export const signal = new AbortController().signal;
export function entry(options: Partial<ToolEntry> = {}): ToolEntry {
  return { metadata: { name: "Fixture" }, ...options } as ToolEntry;
}
export function budget(max = 100, strategy: "inline" | "truncate" | "artifact" = "truncate") {
  return { maxInlineBytes: max, maxModelBytes: max, strategy };
}
export function dependencies(store?: ToolArtifactStorePort): ToolExecutorDeps {
  return {
    sessionId: "session-fixture",
    turnId: "fallback-turn",
    artifactStore: store,
  } as ToolExecutorDeps;
}
export function result(
  content: string,
  options: Partial<ToolResultSerialization> = {},
): ToolResultSerialization {
  return {
    content,
    modelContent: content,
    originalBytes: Buffer.byteLength(content),
    returnedBytes: Buffer.byteLength(content),
    truncated: false,
    budgetStrategy: "truncate",
    ...options,
  };
}
export function artifact(path?: string) {
  return {
    id: "fixture-artifact",
    uri: "artifact:fixture",
    path,
    bytes: 123,
    contentType: "text/plain",
    createdAt: new Date(0),
  };
}
