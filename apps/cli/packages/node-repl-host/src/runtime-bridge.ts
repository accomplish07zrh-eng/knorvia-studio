// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { BrowserClientTransport } from "@knorvia/core/browser-client";

export const NODE_REPL_BROWSER_BRIDGE_SYMBOL = Symbol.for(
  "knorvia.node-repl.browser-control-bridge",
);
export const BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE = "Browser is not available in subagent";
export interface NodeReplBrowserRuntimeBridge extends BrowserClientTransport {
  documentationRoot: string;
  assertAvailable(): void;
}

const requiredMembers = {
  list: "function",
  execute: "function",
  assertAvailable: "function",
  documentationRoot: "string",
} as const;

export function readNodeReplBrowserRuntimeBridge(
  globals: Record<PropertyKey, unknown>,
): NodeReplBrowserRuntimeBridge {
  const value = globals[NODE_REPL_BROWSER_BRIDGE_SYMBOL] as Record<string, unknown> | undefined;
  const valid =
    value && Object.entries(requiredMembers).every(([name, kind]) => typeof value[name] === kind);
  if (valid) return value as unknown as NodeReplBrowserRuntimeBridge;
  throw new Error("Browser runtime bridge is unavailable; use the Knorvia execution host");
}
