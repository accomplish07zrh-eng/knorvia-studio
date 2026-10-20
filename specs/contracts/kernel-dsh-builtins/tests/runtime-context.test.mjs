// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-dsh-builtins B14–B16（修正二）：系统提示里的运行环境信息。
//
// 要证明的三件事：
//   (a) 六个字段都在：主工作目录、平台、shell、OS 版本、当前日期、时区；
//   (b) 日期与工作目录随装配时刻求值，不是启动期常量；
//   (c) 装配结果不出现 DSH 品牌（无 Harness 身份句、无 @deepseek-ai/ 包名）。
//
// 测试走公开入口：另起进程 boot 内核（scripts/kernel-context-probe.mjs），
// 让它装配一次 prompt 并按 JSON 回传，测试只断言公开产物的内容。
// 契约见 specs/contracts/kernel-dsh-builtins/behavior.md B14-B16。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { repoRootPath } from "./entry.mjs";

const FIXTURES = JSON.parse(
  await readFile(new URL("../fixtures/runtime-context.json", import.meta.url), "utf8"),
);

/** tsx 的 ESM loader 地址；Windows 上 --import 只接受 file:// URL。 */
function tsxLoaderUrl() {
  return pathToFileURL(join(repoRootPath, "node_modules/tsx/dist/loader.mjs")).href;
}
const PROBE_SCRIPT = join(repoRootPath, "scripts", "kernel-context-probe.mjs");

/**
 * 在独立进程里 boot 内核并装配 prompt。
 *
 * @param workspace - 探针进程的工作目录（决定「主工作目录」字段）。
 * @returns `{ prompt, sections, contexts, snapshot, artifact }`。
 */
async function readAssembledPrompt(workspace) {
  const root = await mkdtemp(join(tmpdir(), "kernel-builtins-ctx-"));
  try {
    const probe = spawn(process.execPath, ["--import", tsxLoaderUrl(), PROBE_SCRIPT], {
      cwd: workspace,
      env: {
        ...process.env,
        KNORVIA_DATA_BASE_DIR: join(root, "base"),
        KNORVIA_KERNEL_ENGINE: "dsh",
        HOME: join(root, "home"),
        USERPROFILE: join(root, "home"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    probe.stdout.setEncoding("utf8");
    probe.stderr.setEncoding("utf8");
    probe.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    probe.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise((resolveExit) => {
      probe.once("exit", (exitCode) => resolveExit(exitCode));
    });
    if (code !== 0) {
      throw new Error(`context probe failed (exit ${code}); stderr=${JSON.stringify(stderr)}`);
    }
    return JSON.parse(stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("B14 运行环境信息六个字段齐全且取值来自真实宿主", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kernel-builtins-ws-"));
  try {
    const result = await readAssembledPrompt(workspace);
    const snapshot = result.snapshot;

    for (const field of FIXTURES.requiredFields) {
      assert.ok(
        snapshot.includes(field),
        `B14 运行上下文必须先含字段「${field}」；实际=${JSON.stringify(snapshot)}`,
      );
    }
    // 主工作目录必须是探针进程的 cwd。
    assert.ok(
      snapshot.includes(`Primary working directory: ${workspace}`),
      `B14 主工作目录必须是会话 cwd；实际=${JSON.stringify(snapshot)}`,
    );
    // 平台与 shell 按当前平台取值。
    assert.ok(snapshot.includes(`Platform: ${process.platform}`), "B14 平台字段取值错误");
    const expectedShell =
      process.platform === "win32"
        ? FIXTURES.shellByPlatform.win32
        : FIXTURES.shellByPlatform.default;
    assert.ok(snapshot.includes(`Shell: ${expectedShell}`), "B14 shell 字段取值错误");
    // 日期形状必须是 YYYY-MM-DD。
    const dateMatch = /Today's date is (\d{4}-\d{2}-\d{2})\./u.exec(snapshot);
    assert.ok(dateMatch, `B14 日期字段形状不符；实际=${JSON.stringify(snapshot)}`);
    // 时区非空。
    const zoneMatch = /Time zone: (\S+)\./u.exec(snapshot);
    assert.ok(zoneMatch, "B14 时区字段缺失");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("B15 日期与工作目录随装配时刻求值，不是启动期常量", async () => {
  const first = await mkdtemp(join(tmpdir(), "kernel-builtins-ws-a-"));
  const second = await mkdtemp(join(tmpdir(), "kernel-builtins-ws-b-"));
  try {
    const [left, right] = await Promise.all([
      readAssembledPrompt(first),
      readAssembledPrompt(second),
    ]);
    // 两次装配的 cwd 不同 → 渲染出的工作目录必须不同。
    assert.ok(
      left.snapshot.includes(`Primary working directory: ${first}`),
      "B15 第一次装配的工作目录必须是它自己的 cwd",
    );
    assert.ok(
      right.snapshot.includes(`Primary working directory: ${second}`),
      "B15 第二次装配的工作目录必须是它自己的 cwd",
    );
    assert.notEqual(
      left.snapshot,
      right.snapshot,
      "B15 不同 cwd 的两次装配不得产出相同文本（证明是求值不是常量）",
    );
    // 日期字段在两次装配里都必须是「今天」。用宿主本地日期做对照，避免跨日抖动
    // 把断言写死成某个字面量。
    const today = new Date();
    const expectedDate = [
      today.getFullYear(),
      `${today.getMonth() + 1}`.padStart(2, "0"),
      `${today.getDate()}`.padStart(2, "0"),
    ].join("-");
    for (const result of [left, right]) {
      assert.ok(
        result.snapshot.includes(`Today's date is ${expectedDate}.`),
        `B15 日期必须是装配当日（${expectedDate}）；实际=${JSON.stringify(result.snapshot)}`,
      );
    }
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("B16 装配结果不出现 DSH 品牌，且以 Knorvia 开场", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "kernel-builtins-ws-brand-"));
  try {
    const result = await readAssembledPrompt(workspace);

    for (const forbidden of FIXTURES.forbiddenBrandStrings) {
      assert.equal(
        result.prompt.includes(forbidden),
        false,
        `B16 装配后的 prompt 不得含「${forbidden}」`,
      );
      assert.equal(
        result.snapshot.includes(forbidden),
        false,
        `B16 运行上下文不得含「${forbidden}」`,
      );
    }
    // 不得注册 Harness 身份段（includeHarnessIdentity 保持 false）。
    assert.equal(
      result.sections.includes("harness:identity"),
      false,
      "B16 不得注册 Harness 身份段",
    );
    // 必须以 Knorvia persona 开场。
    assert.ok(
      result.prompt.startsWith(result.personaPrefix),
      `B16 装配后的 prompt 必须以 Knorvia persona 开场；实际开头=${JSON.stringify(result.prompt.slice(0, 120))}`,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
