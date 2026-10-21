// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B1–B3：追加行集合、平台二选一与隔离边界。
//
// 断言对象是「组合物化出来的行清单」——本包的合同工作就是追加与配置行，
// 因此行本身就是可观察产物。不 import 组合实现文件，只读公开导出。
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment } from "./_harness.mjs";

/** kernel-dsh-00 的 19 行底座；本包只在其后追加，不重排。 */
const BASE_ROW_IDS = [
  "timer",
  "llm",
  "sessions",
  "session-persistence",
  "session-projection",
  "system-prompt",
  "tools",
  "agents",
  "agent-loop",
  "invariants",
  "session-invariant",
  "agent-invariant",
  "scope-invariant",
  "agent-loop-invariant",
  "agent-instructions",
  "skill",
  "skill-filesystem",
  "mcp-resources",
  "llm-pi-ai",
];

/** 本包承诺追加的行 id（顺序即组合顺序）。 */
const APPENDED_ROW_IDS = [
  "shell",
  "tool-shell",
  "subprocess",
  "shell-env",
  "sandbox",
  "sandbox-policy",
  "approval",
  "fs-sandbox",
  "fs-observation-policy",
  "tool-fs",
  "tool-fs-search",
  "tool-todo",
  "tool-skill",
  "tool-jobs",
  "web",
  "web-search-deepseek",
  "web-fetch-http",
  "tool-web",
  "jobs",
  "commands",
  "token-meter",
  "compaction-basic",
  "tool-result-pruner",
  "command-compact",
  "goal",
  "goal-round-driver",
  "command-goal",
  "tool-goal",
  "plan-mode",
  "subagent",
  "subagent-spawn-in-process",
  "subagent-fork-in-process",
  "tool-subagent-control",
  "tool-subagent-list-agents",
  "tool-subagent",
  "tool-subagent-fork",
  "runtime-context",
];

/** 绝不允许出现在组合里的行（隔离与许可边界）。 */
const FORBIDDEN_ROW_PATTERNS = [
  /dsh-hooks-(?:claude-code|codex)/u,
  /dsh-otel/u,
  /session-telemetry-otel/u,
  /dsh-deepseek-account/u,
  /dsh-credentials-local/u,
];

test("B1 追加行的 id 与顺序固定，且不与底座 19 行重名", async () => {
  const kernel = await loadKernel();
  const dshHome = join(tmpdir(), "kernel-builtins-rows");
  const rows = kernel.createKernelPluginRows(dshHome);

  assert.deepEqual(
    rows.slice(0, BASE_ROW_IDS.length).map((row) => row.id),
    BASE_ROW_IDS,
    "底座 19 行的 id 与顺序必须不变",
  );
  assert.deepEqual(
    rows.slice(BASE_ROW_IDS.length).map((row) => row.id),
    APPENDED_ROW_IDS,
    "追加行的 id 与顺序必须与合同一致",
  );
  const allIds = rows.map((row) => row.id);
  assert.equal(new Set(allIds).size, allIds.length, "全部行 id 必须唯一");
});

test("B1 同样输入两次物化，行内容逐字段相等（幂等）", async () => {
  const kernel = await loadKernel();
  const dshHome = join(tmpdir(), "kernel-builtins-idem");
  const first = kernel.createKernelPluginRows(dshHome);
  const second = kernel.createKernelPluginRows(dshHome);
  assert.deepEqual(second, first, "两次物化的行必须逐字段相等");
});

test("B1 物化不改动蓝图：KERNEL_PLUGIN_ROWS 仍是底座 19 行", async () => {
  const kernel = await loadKernel();
  assert.deepEqual(
    kernel.KERNEL_PLUGIN_ROWS.map((row) => row.id),
    BASE_ROW_IDS,
    "蓝图的 id 集合必须仍是底座 19 行",
  );
  const before = structuredClone(kernel.KERNEL_PLUGIN_ROWS);
  kernel.createKernelPluginRows(join(tmpdir(), "kernel-builtins-blueprint"));
  assert.deepEqual(kernel.KERNEL_PLUGIN_ROWS, before, "物化不得修改蓝图");
});

test("B2 平台二选一：win32 只挂 pwsh 支，其余只挂 bash 支", async () => {
  const kernel = await loadKernel();
  const dshHome = join(tmpdir(), "kernel-builtins-platform");
  for (const [platform, expectedTool] of [
    ["win32", "@deepseek-ai/dsh-tool-pwsh"],
    ["linux", "@deepseek-ai/dsh-tool-bash"],
    ["darwin", "@deepseek-ai/dsh-tool-bash"],
  ]) {
    const rows = kernel.createKernelPluginRows(dshHome, {
      platform,
      moduleIds: kernel.kernelPluginModuleIds(),
    });
    const shellRow = rows.find((row) => row.id === "shell");
    const toolRow = rows.find((row) => row.id === "tool-shell");
    assert.ok(shellRow, `${platform} 必须挂一个 shell 执行器行`);
    assert.equal(toolRow.name, expectedTool, `${platform} 的 shell 工具行必须是 ${expectedTool}`);
    // 执行器行的模块标识必须是本包对应平台那一支，且恰好一条。
    const expectedExecutor =
      platform === "win32" ? "shell-environment-pwsh" : "shell-environment-bash";
    assert.ok(
      shellRow.name.includes(expectedExecutor),
      `${platform} 的执行器行必须是 ${expectedExecutor}；实际=${shellRow.name}`,
    );
    const executors = rows.filter((row) => row.id === "shell");
    assert.equal(executors.length, 1, `${platform} 只能有一个 ctx.shell 实现`);
    // 另一支的模块标识不得出现在任何行里。
    const otherExecutor =
      platform === "win32" ? "shell-environment-bash" : "shell-environment-pwsh";
    assert.equal(
      rows.some((row) => row.name.includes(otherExecutor)),
      false,
      `${platform} 不得挂另一支执行器 ${otherExecutor}`,
    );
  }
});

test("B3 组合不含 Hook 兼容层、遥测、账号与本机凭据行", async () => {
  const kernel = await loadKernel();
  const rows = kernel.createKernelPluginRows(join(tmpdir(), "kernel-builtins-isolation"), {
    platform: process.platform,
    moduleIds: kernel.kernelPluginModuleIds(),
  });
  for (const row of rows) {
    for (const pattern of FORBIDDEN_ROW_PATTERNS) {
      assert.equal(pattern.test(row.name), false, `组合不得含 ${row.name}`);
    }
  }
  assert.equal(
    rows.some((row) => /dsh-credentials/u.test(row.name)),
    false,
    "组合不得含凭据行（凭据由 kernel-plugin-credentials 提供）",
  );
});

test("B1 落盘的行清单与公开物化结果一致，且以单个 LF 结尾", async () => {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-config-"));
  let host;
  try {
    host = await kernel.bootKernel({
      cwd: root,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    const configPath = join(host.dshHome, "knorvia", "kernel.cordis.json");
    const bytes = await readFile(configPath);
    const text = bytes.toString("utf8");
    assert.equal(bytes.includes(0x0d), false, "配置不得包含 CR");
    assert.equal(bytes[bytes.length - 1], 0x0a, "配置必须以单个 LF 结尾");
    const parsed = JSON.parse(text);
    const moduleIds = kernel.kernelPluginModuleIds();
    assert.deepEqual(
      parsed,
      kernel.createKernelPluginRows(host.dshHome, {
        platform: process.platform,
        // 物化时用的就是启动 cwd；不给 cwd 会落到宿主 process.cwd()，那是另一个值。
        cwd: root,
        moduleIds,
        // 真实启动会挂凭据 provider（`host.ts` 传 `moduleIds.credentials`）。
        // 这里必须同样传上，否则「落盘的行」与「公开物化结果」会差一行 ——
        // 而那正是这条断言要防的事：落盘内容必须如实反映代码路径。
        credentialProviderModuleId: moduleIds.credentials,
      }),
      "落盘的行必须与公开物化结果逐字段一致",
    );
  } finally {
    try {
      await host?.dispose();
    } catch {
      // dispose 失败由 kernel-dsh-00 的用例负责；这里只做清理。
    }
    await rm(root, { recursive: true, force: true });
  }
});
