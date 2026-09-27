// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import type { ComputerUseRuntime } from "@knorvia/cua";
import type { NodeReplExecutor } from "../src/executor.js";
import { ProtocolRegistry, windowsRuntime } from "./dispatch-test-support.js";

export const captured: unknown[] = [];
export const capturedRuntime: ComputerUseRuntime = {
  execute: async () => ({ content: [] }),
  dispose: async () => {},
  closeSession: async () => {},
};
mock.module("@modelcontextprotocol/server", {
  namedExports: { Server: ProtocolRegistry, INVALID_PARAMS: -32602 },
});
mock.module("@modelcontextprotocol/server/stdio", {
  namedExports: { serveStdio: () => assert.fail("Unit dispatch must not start stdio") },
});
mock.module("@knorvia/cua", {
  namedExports: {
    createComputerUseRuntime: (options: unknown) => {
      captured.push(options);
      return capturedRuntime;
    },
  },
});
delete process.env.KNORVIA_CUA_PERMISSION_BROKER_SOCKET;
delete process.env.KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER;
export const {
  createNodeReplMcpRuntime,
  captureComputerUseRuntimeFromEnvironment,
  setNodeReplMcpProcessTitle,
} = await import("../src/server.js");

export function fixture(
  t: TestContext,
  executeJs: NodeReplExecutor = async () => ({ logs: "done" }),
  options: Parameters<typeof createNodeReplMcpRuntime>[0] = {},
) {
  const runtime = createNodeReplMcpRuntime({
    executeJs,
    windowsRuntime: windowsRuntime(),
    ...options,
  });
  t.after(() => runtime.dispose());
  return { runtime, server: runtime.server as unknown as ProtocolRegistry };
}
