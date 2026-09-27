// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { createComputerUseRuntime, type ComputerUseRuntime } from "@knorvia/cua";

export const NODE_REPL_MCP_PROCESS_TITLE = "knorvia-node-repl-mcp";
export function setNodeReplMcpProcessTitle(target: { title: string } = process): void {
  target.title = NODE_REPL_MCP_PROCESS_TITLE;
}

/** Only this adapter reads the existing optional permission-service configuration. */
export function captureComputerUseRuntimeFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ComputerUseRuntime | undefined {
  const address = env.KNORVIA_CUA_PERMISSION_BROKER_SOCKET?.trim();
  if (!address) return undefined;
  return createComputerUseRuntime({
    brokerSocketPath: address,
    refreshMarkerPath: env.KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER?.trim(),
  });
}
