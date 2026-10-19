// SPDX-License-Identifier: Apache-2.0
// kernel-dsh-00 B1/B2/B20：引擎选择、默认路径零 DSH 加载、既有命令不受开关影响。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { cliEntry, loadKernelEngine, repoRoot } from "./entry.mjs";
import {
  KERNEL_READY,
  kernelEnv,
  makeTempDir,
  removeTempDir,
  spawnCli,
  withTimeout,
} from "./_process.mjs";

test("B1 resolveKernelEngine 只把去空白后恰好 dsh 的值判为新运行时", async () => {
  const { resolveKernelEngine } = await loadKernelEngine();
  const cases = [
    [undefined, "legacy"],
    ["", "legacy"],
    ["legacy", "legacy"],
    ["DSH", "legacy"],
    ["dshx", "legacy"],
    ["dsh", "dsh"],
    [" dsh ", "dsh"],
    ["\tdsh\n", "dsh"],
  ];
  for (const [value, expected] of cases) {
    const env = value === undefined ? {} : { KNORVIA_KERNEL_ENGINE: value };
    assert.equal(resolveKernelEngine(env), expected, JSON.stringify(value));
  }
});

test("B1 app-server 只在 dsh 取值下启动新运行时，其余取值保持旧路径", async () => {
  const root = await makeTempDir("kernel-dsh-engine-");
  try {
    const cases = [
      ["dsh", true],
      [" dsh ", true],
      ["legacy", false],
      ["DSH", false],
      [undefined, false],
    ];
    for (const [index, [value, expectReady]] of cases.entries()) {
      const env = kernelEnv({
        dataBase: join(root, `data-${index}`),
        home: join(root, `home-${index}`),
      });
      if (value === undefined) delete env.KNORVIA_KERNEL_ENGINE;
      else env.KNORVIA_KERNEL_ENGINE = value;

      const proc = spawnCli(["app-server", "--stdio"], env);
      proc.child.stdin.end();
      const { code } = await withTimeout(proc.exit, 60_000, `app-server ${JSON.stringify(value)}`);
      assert.equal(code, 0, `app-server 在 ${JSON.stringify(value)} 下应正常退出`);
      assert.equal(
        proc.state.stderr.includes(KERNEL_READY),
        expectReady,
        `app-server 在 ${JSON.stringify(value)} 下的就绪标记`,
      );
      if (!expectReady) {
        assert.equal(proc.state.stderr.includes("knorvia-kernel-"), false);
        assert.ok(proc.state.stdout.length > 0, "旧路径应输出既有协议帧");
      }
    }
  } finally {
    await removeTempDir(root);
  }
});

test("B2/B20 默认路径不解析任何 @deepseek-ai/*，开关路径才加载 DSH", async () => {
  const root = await makeTempDir("kernel-dsh-load-");
  const traceFile = join(root, "dsh-specifiers.txt");
  const registerFile = join(root, "register.mjs");
  const hookFile = join(root, "hook.mjs");
  await writeFile(
    registerFile,
    'import { register } from "node:module";\nregister("./hook.mjs", import.meta.url);\n',
  );
  await writeFile(
    hookFile,
    [
      'import { appendFileSync } from "node:fs";',
      "export async function resolve(specifier, context, nextResolve) {",
      '  if (specifier.startsWith("@deepseek-ai/")) {',
      "    appendFileSync(process.env.KNORVIA_TEST_DSH_TRACE, `${specifier}\\n`);",
      "  }",
      "  return nextResolve(specifier, context);",
      "}",
      "",
    ].join("\n"),
  );

  const runWithTrace = async (args, engine, index) => {
    const tracePath = `${traceFile}-${index}`;
    await rm(tracePath, { force: true });
    const env = kernelEnv({
      dataBase: join(root, `data-${index}`),
      home: join(root, `home-${index}`),
      extra: { KNORVIA_TEST_DSH_TRACE: tracePath },
    });
    if (engine === undefined) delete env.KNORVIA_KERNEL_ENGINE;
    else env.KNORVIA_KERNEL_ENGINE = engine;

    const child = spawn(process.execPath, ["--import", registerFile, cliEntry, ...args], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const { code } = await withTimeout(
      new Promise((resolveExit, rejectExit) => {
        child.once("error", rejectExit);
        child.once("exit", (exitCode, signal) => resolveExit({ code: exitCode, signal }));
      }),
      60_000,
      `${args.join(" ")} 追踪运行`,
    );
    assert.equal(code, 0, `${args.join(" ")} 应成功；stderr=${stderr}`);
    try {
      return await readFile(tracePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return "";
      throw error;
    }
  };

  try {
    for (const [index, args] of [["version"], ["help"], ["app-server", "--stdio"]].entries()) {
      const trace = await runWithTrace(args, undefined, index);
      assert.equal(
        trace.includes("@deepseek-ai/"),
        false,
        `${args.join(" ")} 不得解析 DSH 模块：${trace}`,
      );
    }

    const dshTrace = await runWithTrace(["app-server", "--stdio"], "dsh", 9);
    assert.match(
      dshTrace,
      /@deepseek-ai\/dsh-app-boot/u,
      "开关路径必须经动态解析加载 DSH，才能证明追踪钩子有效",
    );
  } finally {
    await removeTempDir(root);
  }
});
