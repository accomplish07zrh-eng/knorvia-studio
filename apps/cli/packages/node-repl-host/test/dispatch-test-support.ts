// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { WindowsComputerRuntime } from "@knorvia/cua/windows";

export interface RequestParams {
  name: string;
  arguments?: unknown;
}
type Handler = (
  request: { params: RequestParams },
  extra: {
    mcpReq: { signal: AbortSignal; _meta: Record<string, unknown> };
  },
) => Promise<CallToolResult>;

export class ProtocolRegistry {
  readonly handlers = new Map<string, Handler>();
  constructor(
    readonly identity: Record<string, unknown>,
    readonly configuration: Record<string, unknown>,
  ) {}
  setRequestHandler(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }
  call(
    params: RequestParams,
    context: unknown = {},
    signal = new AbortController().signal,
  ): Promise<CallToolResult> {
    return this.handlers.get("tools/call")!(
      { params },
      { mcpReq: { signal, _meta: { "com.knorvia-studio/request-context": context } } },
    );
  }
  async list(): Promise<{ tools: Array<{ name: string; inputSchema: Record<string, unknown> }> }> {
    const result = await this.handlers.get("tools/list")!(
      { params: { name: "" } },
      { mcpReq: { signal: new AbortController().signal, _meta: {} } },
    );
    return result as unknown as {
      tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    };
  }
}

export function windowsRuntime(
  overrides: Partial<WindowsComputerRuntime> = {},
): WindowsComputerRuntime {
  return {
    listTools: () => [],
    execute: async () => ({ content: [], structuredContent: {} }),
    dispose: async () => {},
    closeSession: async () => {},
    ...overrides,
  };
}

export function watch<T>(promise: Promise<T>) {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return { settled: () => settled, promise };
}
