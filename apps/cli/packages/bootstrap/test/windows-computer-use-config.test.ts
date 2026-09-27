import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppRuntimeConfig } from "../src/app/runtime-config.js";

type Input = Parameters<typeof resolveAppRuntimeConfig>[0];
const host = {
  type: "stdio" as const,
  command: "fixture-host",
  env: { KNORVIA_WINDOWS_COMPUTER_USE: "1" },
};
const userHost = { ...host, command: "untrusted-host" };

function resolve(overrides: Partial<Input> = {}) {
  return resolveAppRuntimeConfig({
    cliStorageRoot: "C:/fixture/storage",
    workingDirectory: "C:/fixture",
    subagentOutputRootDir: "C:/fixture/output",
    configResult: {
      config: {
        mcp: { servers: {} },
        permission: { mode: "build" },
        skills: { metadataBudget: 1000 },
        toolConcurrency: { maxConcurrency: 1 },
        features: { mcp: true, memory: false, subagent: false },
        memory: { use: false },
        modelAnomalyGuard: {},
      },
    } as Input["configResult"],
    options: {},
    ...overrides,
  });
}

test("only the enabled plugin and final builtin Windows host receive trusted computer tools", () => {
  const result = resolve({
    pluginRuntimeFeatures: { computerUse: true },
    builtInMcpServers: { node_repl: host },
    pluginMcpServers: { node_repl: userHost },
    options: {
      runtimeConfig: {
        mcp: { servers: { node_repl: userHost }, trustedWindowsComputerUseServerNames: ["spoof"] },
      },
    },
  });
  assert.strictEqual(result.configuredMcpServers.node_repl, host);
  assert.deepEqual(
    result.runtimeConfig.mcp?.trustedWindowsComputerUseServerNames,
    process.platform === "win32" ? ["node_repl"] : [],
  );
  assert.ok(!result.runtimeConfig.mcp?.trustedOfficialCuaServerNames?.includes("node_repl"));
});

test("disabled plugin, user/plugin name spoof, or disabled driver cannot acquire provenance", () => {
  for (const overrides of [
    { builtInMcpServers: { node_repl: host } },
    { pluginRuntimeFeatures: { computerUse: false }, builtInMcpServers: { node_repl: host } },
    { pluginRuntimeFeatures: { computerUse: true }, pluginMcpServers: { node_repl: host } },
    {
      pluginRuntimeFeatures: { computerUse: true },
      options: {
        runtimeConfig: {
          mcp: {
            servers: { node_repl: host },
            trustedWindowsComputerUseServerNames: ["node_repl"],
          },
        },
      },
    },
    {
      pluginRuntimeFeatures: { computerUse: true },
      builtInMcpServers: { node_repl: { ...host, enabled: false } },
    },
    {
      pluginRuntimeFeatures: { computerUse: true },
      builtInMcpServers: { node_repl: { ...host, env: { KNORVIA_WINDOWS_COMPUTER_USE: "0" } } },
    },
  ]) {
    assert.deepEqual(
      resolve(overrides).runtimeConfig.mcp?.trustedWindowsComputerUseServerNames,
      [],
    );
  }
});
