import assert from "node:assert/strict";
import test from "node:test";
import { endWindowsComputerTurn } from "../src/runtime/methods/windows-computer-turn-end.js";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import type { TraceContext } from "../src/runtime/deps.js";

function fixture() {
  const calls: Array<Record<string, unknown>> = [];
  const warnings: unknown[] = [];
  const runtime = {
    config: {
      runtimeFeatures: { computerUse: true },
      workspaceIdentity: "identity",
      mcp: { trustedWindowsComputerUseServerNames: ["node_repl"] },
    },
    workingDirectory: "D:/owned-fixture",
    mcpInitialized: true,
    registry: { has: () => true },
    mcpPort: {
      callTool: async (input: Record<string, unknown>, options: { signal: AbortSignal }) => {
        assert.equal(options.signal.aborted, false);
        calls.push(input);
        return { content: [] };
      },
    },
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
  } as unknown as AgentRuntimeInternal;
  const trace = { traceId: "trace", sessionId: "session", turnId: "turn" } as TraceContext;
  return { runtime, trace, calls, warnings };
}

test("turn end stops an idle computer scope through its trusted host and exact context", async () => {
  const f = fixture();
  await endWindowsComputerTurn(f.runtime, f.trace);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], {
    serverName: "node_repl",
    toolName: "computer_stop",
    arguments: {},
    trace: f.trace,
    runtimeScope: "main",
    workspacePath: "D:/owned-fixture",
    workspaceIdentity: "identity",
    workspaceKey: "identity",
    turnId: "turn",
    clientMode: "desktop-continuous",
    deliveryKind: "desktop-continuous",
  });
});

test("disabled, remote, subagent and uninitialized contexts do not start a cleanup connection", async () => {
  for (const change of [
    (r: AgentRuntimeInternal) => {
      r.config.runtimeFeatures = { computerUse: false };
    },
    (r: AgentRuntimeInternal) => {
      r.config.remoteSessionId = "remote";
    },
    (r: AgentRuntimeInternal) => {
      r.config.taskType = "subagent_child";
    },
    (r: AgentRuntimeInternal) => {
      r.mcpInitialized = false;
    },
    (r: AgentRuntimeInternal) => {
      r.config.mcp = {};
    },
  ]) {
    const f = fixture();
    change(f.runtime);
    await endWindowsComputerTurn(f.runtime, f.trace);
    assert.equal(f.calls.length, 0);
  }
});

test("cleanup failure records a bounded diagnostic without replacing the turn outcome", async () => {
  const f = fixture();
  f.runtime.mcpPort!.callTool = async () => {
    throw new Error("private driver detail");
  };
  await endWindowsComputerTurn(f.runtime, f.trace);
  assert.equal(f.warnings.length, 1);
  assert.doesNotMatch(JSON.stringify(f.warnings), /private driver detail/);
});

test("hiding stop from model tools cannot suppress trusted lifecycle cleanup", async () => {
  const f = fixture();
  f.runtime.registry.has = () => false;
  await endWindowsComputerTurn(f.runtime, f.trace);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.toolName, "computer_stop");
});
