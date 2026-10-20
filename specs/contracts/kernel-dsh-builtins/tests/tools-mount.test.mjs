// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B4–B7：内置工具的可见集合与实际可执行性。
//
// 只经公开入口：boot 内核后用 `ctx.tools`（DSH 公开服务）解析工具并真实执行；
// 不 import 任何工具实现文件。
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadKernel } from "./_kernel-entry.mjs";
import { QUIET_LOGGER, isolatedEnvironment, runTool } from "./_harness.mjs";

/** 与平台无关的承诺工具名。shell 工具按平台二选一，见 B2。 */
const PLATFORM_NEUTRAL_TOOLS = [
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "todo_write",
  "web_search",
  "web_fetch",
  "skill",
  "job_output",
  "job_list",
  "job_kill",
  "exit_plan_mode",
  "subagent",
  "subagent_fork",
  "list_agents",
];

/** shell 工具在不同平台的官方名。 */
function shellToolName(platform) {
  return platform === "win32" ? "pwsh" : "bash";
}

/**
 * 起一个内核并在回调里做事；无论回调结果如何都释放裸内核与临时目录。
 *
 * @param callback - 收到 `{ kernel, ctx, workspace }` 的回调。
 * @returns 回调的返回值。
 */
async function withKernel(callback) {
  const kernel = await loadKernel();
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-tools-"));
  const workspace = join(root, "ws");
  let host;
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workspace, { recursive: true });
    host = await kernel.bootKernel({
      cwd: workspace,
      env: isolatedEnvironment({ KNORVIA_DATA_BASE_DIR: join(root, "base") }),
      logger: QUIET_LOGGER,
    });
    return await callback({ kernel, ctx: host.context, workspace, host });
  } finally {
    try {
      await host?.dispose();
    } catch {
      // 释放失败由 kernel-dsh-00 的用例负责；这里只做清理。
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("B4 模型可见的工具集合包含本包承诺的全部工具名", async () => {
  await withKernel(async ({ ctx }) => {
    const registered = new Set(
      ctx
        .get("tools")
        .schemas()
        .map((schema) => schema.name),
    );
    const expected = [...PLATFORM_NEUTRAL_TOOLS, shellToolName(process.platform)];
    // 按平台的反面那支不得出现（B2 的取舍同样体现在工具面上）。
    const forbiddenShell = shellToolName(process.platform === "win32" ? "linux" : "win32");
    assert.equal(
      registered.has(forbiddenShell),
      false,
      `不得注册另一平台的 shell 工具 ${forbiddenShell}`,
    );
    for (const name of expected) {
      assert.ok(
        registered.has(name),
        `B4 必须注册工具 ${name}；实际=${[...registered].sort().join(",")}`,
      );
      assert.ok(ctx.get("tools").get(name), `B4 工具 ${name} 必须能被 ctx.tools.get 解析`);
    }
  });
});

test("B5 shell 工具真实执行一条无副作用命令", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const marker = "kernel-builtins-shell-probe";
    const command = process.platform === "win32" ? `'${marker}'` : `echo '${marker}'`;
    const { text, isError } = await runTool(ctx, shellToolName(process.platform), {
      command,
      description: "print a probe marker",
      workdir: workspace,
    });
    assert.equal(isError, false, `B5 shell 工具不得报错；实际文本=${JSON.stringify(text)}`);
    assert.ok(text.includes(marker), `B5 shell 输出必须含标记；实际=${JSON.stringify(text)}`);
    // 退出码 0 时不得带失败标记。
    assert.equal(/\[exit code: [1-9]/u.test(text), false, "B5 退出码 0 时不得带非零退出标记");
  });
});

test("B5 shell 工具的非零退出是结果而不是工具错误", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const command = process.platform === "win32" ? "exit 3" : "exit 3";
    const { text } = await runTool(ctx, shellToolName(process.platform), {
      command,
      description: "exit with a non-zero code",
      workdir: workspace,
    });
    assert.ok(
      text.includes("exit code: 3"),
      `B5 必须在结果里报告退出码 3；实际=${JSON.stringify(text)}`,
    );
  });
});

test("B6 文件与搜索工具真实可执行：写→读回、glob 命中、grep 命中", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const fileName = "builtins-probe.txt";
    const filePath = join(workspace, fileName);
    const body = "alpha line\nbeta marker line\n";
    await writeFile(filePath, body, "utf8");

    const read = await runTool(ctx, "read", { file_path: filePath }, { seq: 1 });
    assert.equal(read.isError, false, `B6 read 不得报错；实际=${JSON.stringify(read.text)}`);
    assert.ok(read.text.includes("beta marker line"), "B6 read 必须返回文件内容");

    const glob = await runTool(ctx, "glob", { pattern: fileName, path: workspace }, { seq: 2 });
    assert.equal(glob.isError, false, `B6 glob 不得报错；实际=${JSON.stringify(glob.text)}`);
    assert.ok(
      glob.text.includes(fileName),
      `B6 glob 必须命中 ${fileName}；实际=${JSON.stringify(glob.text)}`,
    );

    const grep = await runTool(
      ctx,
      "grep",
      { pattern: "beta marker", path: workspace },
      { seq: 3 },
    );
    assert.equal(grep.isError, false, `B6 grep 不得报错；实际=${JSON.stringify(grep.text)}`);
    assert.ok(
      grep.text.includes(fileName),
      `B6 grep 必须命中 ${fileName}；实际=${JSON.stringify(grep.text)}`,
    );

    const write = await runTool(
      ctx,
      "write",
      { file_path: join(workspace, "written.txt"), content: "written body\n" },
      { seq: 4 },
    );
    assert.equal(write.isError, false, `B6 write 不得报错；实际=${JSON.stringify(write.text)}`);
    const readBack = await runTool(
      ctx,
      "read",
      { file_path: join(workspace, "written.txt") },
      { seq: 5 },
    );
    assert.ok(readBack.text.includes("written body"), "B6 write 之后 read 必须读回同一内容");
  });
});

test("B6 读不存在的文件是工具错误", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    const { isError, text } = await runTool(ctx, "read", {
      file_path: join(workspace, "does-not-exist.txt"),
    });
    assert.equal(isError, true, `B6 读不存在的文件必须是工具错误；实际=${JSON.stringify(text)}`);
  });
});

test("B7 todo_write 已注册且并行 in-progress 被允许", async () => {
  await withKernel(async ({ ctx, workspace }) => {
    assert.ok(ctx.get("tools").get("todo_write"), "B7 必须注册 todo_write");
    const { isError, text } = await runTool(
      ctx,
      "todo_write",
      {
        todos: [
          { content: "first parallel item", status: "in_progress" },
          { content: "second parallel item", status: "in_progress" },
        ],
      },
      { seq: 1, agent: await createProbeAgent(ctx, workspace) },
    );
    assert.equal(
      isError,
      false,
      `B7 allowParallelInProgress 必须允许两个 in-progress；实际=${JSON.stringify(text)}`,
    );
  });
});

test("B7 技能注册表在位：本包不挂文件系统技能来源", async () => {
  await withKernel(async ({ ctx }) => {
    const skills = ctx.get("skills");
    assert.ok(skills, "B7 ctx.skills 必须存在");
    const listed = await skills.list();
    for (const entry of listed) {
      assert.equal(
        entry.name === "project-skill" || entry.name === "home-skill",
        false,
        `B7 不得读到文件系统技能：${entry.name}`,
      );
    }
  });
});

test("B7 todos 投影单元已注册", async () => {
  await withKernel(async ({ ctx }) => {
    const projections = ctx.get("sessionProjections");
    assert.ok(
      projections.registrations.has("todos"),
      `B7 必须注册 todos 投影；实际=${[...projections.registrations.keys()].join(",")}`,
    );
  });
});

/**
 * 造一个探针 Agent：部分工具（todo、目标）要求有明确的调用者会话。
 *
 * @param ctx - 内核根 context。
 * @param workspace - 该 Agent 的工作目录。
 * @returns 已发布的 `Agent`。
 */
async function createProbeAgent(ctx, workspace) {
  const handle = await ctx.get("agents").create({
    sessionId: "kernel-builtins-probe-agent",
    meta: { cwd: workspace },
  });
  return handle.agent;
}
