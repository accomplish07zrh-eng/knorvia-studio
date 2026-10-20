// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B21/B22：子 Agent 与 MCP 客户端。
//
// B22 的 MCP 是启动期组合（每个服务器一行），因此断言分两处：
//   1) 行生成与字段映射：由 Knorvia 侧配置映射出的行，逐字段核对（含禁用服务器
//      不生成行）。合同 §B22 明确允许这一形态——真实服务器连通归 kernel-switch
//      验收（known-differences D24），离线回归不依赖外部服务器。
//   2) 运行期服务：不配服务器时 boot，断言 MCP 资源服务在位（DSH 公开服务名）。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

const FIXTURE_PATH = new URL("../fixtures/mcp-servers.json", import.meta.url);

/** 读夹具里的虚构服务器配置。 */
async function readMcpFixture() {
  return JSON.parse(await readFile(FIXTURE_PATH, "utf8")).servers;
}

/**
 * 起一个内核并把回调交给它；退出时释放内核与临时目录。
 *
 * @param callback - 收到 `{ ctx, kernel, host }` 的回调。
 * @returns 回调的返回值。
 */
async function withKernel(callback) {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-subagent-"));
  const workspace = join(root, "ws");
  let host;
  try {
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    return await callback({ ctx: host.context, kernel, host });
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责。
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("B21 子 Agent 有 spawn 与 fork 两个 provider", async () => {
  await withKernel(async ({ ctx }) => {
    const subagents = ctx.get("subagents");
    assert.ok(subagents, "B21 必须挂 dsh-subagent（ctx.subagents）");
    const providers = [...subagents.providers.keys()].sort();
    assert.deepEqual(
      providers,
      ["fork", "spawn"],
      `B21 provider 必须是 fork 与 spawn；实际=${providers}`,
    );
  });
});

test("B21 subagent / subagent_fork / 控制面工具都已注册", async () => {
  await withKernel(async ({ ctx }) => {
    const tools = ctx.get("tools");
    for (const name of [
      "subagent",
      "subagent_fork",
      "list_agents",
      "send_message",
      "interrupt_agent",
    ]) {
      assert.ok(tools.get(name), `B21 必须注册子 Agent 工具 ${name}`);
    }
  });
});

test("B21 子 Agent 相关投影单元已注册", async () => {
  await withKernel(async ({ ctx }) => {
    const registrations = ctx.get("sessionProjections").registrations;
    for (const name of ["subagentCatalog", "subagent", "subagentTiming"]) {
      assert.ok(registrations.has(name), `B21 必须注册投影 ${name}`);
    }
  });
});

test("B22 每个启用的服务器生成一行 dsh-mcp-client，禁用服务器不生成", async () => {
  const servers = await readMcpFixture();
  const kernel = await loadKernel();
  const rows = kernel.createKernelPluginRows(join(tmpdir(), "kernel-builtins-mcp-rows"), {
    platform: process.platform,
    cwd: tmpdir(),
    moduleIds: kernel.kernelPluginModuleIds(),
    mcpServers: servers,
  });
  const mcpRows = rows.filter((row) => row.name === "@deepseek-ai/dsh-mcp-client");
  assert.deepEqual(
    mcpRows.map((row) => row.config?.serverName).sort(),
    ["fixture-http", "fixture-stdio"],
    "B22 只应为启用的服务器生成行",
  );
  assert.equal(
    mcpRows.some((row) => row.config?.serverName === "fixture-disabled"),
    false,
    "B22 禁用服务器不得生成行",
  );
  // 行 id 必须唯一，且不与既有行重名。
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, "B22 生成 MCP 行后全部行 id 仍须唯一");
});

test("B22 stdio 与 http 两种 transport 的字段按配置映射", async () => {
  const servers = await readMcpFixture();
  const kernel = await loadKernel();
  const rows = kernel.createKernelPluginRows(join(tmpdir(), "kernel-builtins-mcp-map"), {
    platform: process.platform,
    cwd: tmpdir(),
    moduleIds: kernel.kernelPluginModuleIds(),
    mcpServers: servers,
  });
  const byName = new Map(
    rows
      .filter((row) => row.name === "@deepseek-ai/dsh-mcp-client")
      .map((row) => [row.config.serverName, row.config]),
  );

  const stdio = byName.get("fixture-stdio");
  assert.ok(stdio, "B22 必须有 fixture-stdio 行");
  assert.equal(stdio.transport, "stdio", "B22 stdio 服务器的 transport 必须是 stdio");
  assert.equal(stdio.command, servers["fixture-stdio"].command, "B22 command 必须原样透传");
  assert.deepEqual(stdio.args, servers["fixture-stdio"].args, "B22 args 必须原样透传");
  assert.deepEqual(stdio.env, servers["fixture-stdio"].env, "B22 env 必须原样透传");

  const http = byName.get("fixture-http");
  assert.ok(http, "B22 必须有 fixture-http 行");
  assert.equal(http.transport, "streamable-http", "B22 http 服务器必须走 streamable-http");
  assert.equal(http.url, servers["fixture-http"].url, "B22 url 必须原样透传");
  assert.deepEqual(http.headers, servers["fixture-http"].headers, "B22 headers 必须原样透传");
});

test("B22 boot 后 MCP 资源服务在位，未配服务器时不生成 MCP 行", async () => {
  await withKernel(async ({ ctx, kernel, host }) => {
    assert.ok(ctx.get("mcpResources"), "B22 MCP 资源服务必须已挂载");
    const rows = kernel.createKernelPluginRows(host.dshHome);
    assert.equal(
      rows.some((row) => row.name === "@deepseek-ai/dsh-mcp-client"),
      false,
      "B22 未提供服务器配置时不得生成 MCP 客户端行",
    );
  });
});

test("B22 同一配置两次物化生成同样的行（幂等）", async () => {
  const servers = await readMcpFixture();
  const kernel = await loadKernel();
  const dshHome = join(tmpdir(), "kernel-builtins-mcp-idem");
  const build = () =>
    kernel.createKernelPluginRows(dshHome, {
      platform: process.platform,
      cwd: tmpdir(),
      moduleIds: kernel.kernelPluginModuleIds(),
      mcpServers: servers,
    });
  assert.deepEqual(build(), build(), "B22 同一配置两次物化必须逐字段相等");
});
