// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import {
  JsInputJsonSchema,
  JsOutputJsonSchema,
  JsOutputSchema,
  JsRuntimeInputSchema,
  type JsOutput,
  type SessionId,
} from "@knorvia/contracts";
import type { ToolEntry } from "../types.js";
import { saveBrowserScreenshots } from "../repl/artifacts.js";
import { jsDescription } from "../repl/description.js";
import { formatJsModelContent, toolOutput } from "../repl/output.js";
import { REPL_TIMEOUT, ReplToolSessions } from "../repl/session-registry.js";

const sessions = new ReplToolSessions();
// 完整浏览器文档需要 64 KiB；保持模型预算和 tail 预览一致，避免有效 API 被截断。
const MODEL_BYTES = 64 * 1024;
const INLINE_BYTES = 1_000_000;

export function disposeNodeReplSession(sessionId: SessionId): void {
  sessions.dispose(sessionId);
}

export const jsToolEntry: ToolEntry = {
  capability:
    "Evaluate JavaScript cells with persistent Node bindings and explicit per-call context",
  metadata: {
    name: "js",
    description: jsDescription(),
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: REPL_TIMEOUT.defaultMs,
    sideEffectScope: "system",
    riskLevel: "high",
    needsApproval: true,
  },
  inputSchema: JsInputJsonSchema,
  outputSchema: JsOutputJsonSchema,
  runtimeInputSchema: JsRuntimeInputSchema,
  runtimeOutputSchema: JsOutputSchema,
  async handler(input, context): Promise<JsOutput> {
    const parsed = JsRuntimeInputSchema.parse(input);
    const run = await sessions.run(parsed, context);
    const paths = await saveBrowserScreenshots(run, context);
    return toolOutput(run, paths);
  },
  formatModelContent: formatJsModelContent,
  permission: {
    permission: "node_repl",
    reason: "JavaScript can use the full Node process and module APIs to affect this system",
    riskLevel: "high",
    sideEffectScope: "system",
    needsApproval: true,
    denyPriority: "beforeAsk",
    patternSources: ["input"],
    alwaysAllowPatternSources: [],
  },
  timeout: { ...REPL_TIMEOUT, allowCallOverride: true },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "JavaScript execution was cancelled",
  },
  resultBudget: {
    maxInlineBytes: INLINE_BYTES,
    maxModelBytes: MODEL_BYTES,
    strategy: "artifact",
    preview: { maxBytes: MODEL_BYTES, direction: "tail" },
    artifact: { enabled: true, retention: "session" },
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};

export function createJsToolEntry(options: { browserUseEnabled?: boolean } = {}): ToolEntry {
  return {
    ...jsToolEntry,
    metadata: { ...jsToolEntry.metadata, description: jsDescription(options.browserUseEnabled) },
  };
}
