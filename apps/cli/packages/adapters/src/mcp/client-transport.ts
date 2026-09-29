// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { resolve } from "node:path";
import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
  SdkError,
  SdkErrorCode,
  UnsupportedProtocolVersionError,
  type VersionNegotiationOptions,
} from "@modelcontextprotocol/client";
import type { McpServerConfig } from "@knorvia/contracts";
import { authProvider } from "./client-auth.js";
import { officialHttpFetch, officialStdioMeta, usesOfficialAuth } from "./client-official.js";
import type { McpClientState, ProtocolTransport } from "./client-state.js";
import { buildMcpStdioEnv, createMcpTransportFetch } from "./network.js";
import { ProcessTreeStdioClientTransport } from "./stdio-transport.js";

const PINNED_PROTOCOL = "2026-07-28";
const MAX_AUTO_PROBE_MS = 5_000;

export function negotiation(config: McpServerConfig, timeoutMs: number): VersionNegotiationOptions {
  if (config.protocolVersion === PINNED_PROTOCOL)
    return {
      mode: { pin: PINNED_PROTOCOL },
      probe: { timeoutMs: Math.max(1, Math.floor(timeoutMs)) },
    };
  if (config.type === "sse" || config.protocolVersion === "legacy") return { mode: "legacy" };
  return {
    mode: "auto",
    probe: { timeoutMs: Math.max(1, Math.min(MAX_AUTO_PROBE_MS, Math.floor(timeoutMs / 2))) },
  };
}

export function createTransport(
  state: McpClientState,
  name: string,
  config: McpServerConfig,
  generation: number,
  signal: AbortSignal | undefined,
  workingDirectory: string | undefined,
): ProtocolTransport {
  if (config.type === "stdio") {
    return new ProcessTreeStdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd
        ? resolve(workingDirectory ?? state.workingDirectory ?? process.cwd(), config.cwd)
        : (workingDirectory ?? state.workingDirectory),
      env: { ...buildMcpStdioEnv({ env: state.env, network: state.network }), ...config.env },
      stderr: "pipe",
      ...(usesOfficialAuth(config)
        ? { requestMetaProvider: () => officialStdioMeta(state, name, config, signal) }
        : {}),
    });
  }
  const plainFetch = createMcpTransportFetch({ env: state.env, network: state.network });
  if (config.type === "http") {
    const fetch = officialHttpFetch(state, name, config, generation, plainFetch);
    return new StreamableHTTPClientTransport(new URL(config.url), {
      authProvider: authProvider(state, name, config),
      fetch,
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
  }
  return new SSEClientTransport(new URL(config.url), {
    authProvider: authProvider(state, name, config),
    fetch: plainFetch,
    requestInit: config.headers ? { headers: config.headers } : undefined,
  });
}

export function protocolFailure(error: unknown): boolean {
  if (error instanceof SdkError && error.code === SdkErrorCode.EraNegotiationFailed) return true;
  if (UnsupportedProtocolVersionError.isInstance(error)) return true;
  if (error !== null && typeof error === "object" && "cause" in error) {
    const cause = error.cause;
    if (cause !== undefined && cause !== error) return protocolFailure(cause);
  }
  return false;
}
