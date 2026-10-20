// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 测试探针：在一个独立进程里 boot 内核，用已挂载的 shell 执行器跑一条命令，
// 把子进程读到的结果写到 stdout。放在 scripts/ 下是因为它要用 tsx 解析源码入口，
// 且必须与契约测试的宿主进程分离（boot 会清洗宿主环境）。
//
// 入口走公开子路径（与契约测试同一条解析规则）：dist 默认，KNORVIA_KERNEL_ENTRY=source 走源码。
// 契约见 specs/contracts/kernel-dsh-builtins/behavior.md B9-B13。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entryMode = process.env.KNORVIA_KERNEL_ENTRY === "source" ? "source" : "dist";
const extension = entryMode === "dist" ? ".js" : ".ts";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kernelEntry = join(
  repoRoot,
  "apps/cli/packages/bootstrap",
  entryMode === "dist" ? "dist/kernel" : "src/kernel",
  `index${extension}`,
);

const script = process.env.KNORVIA_PROBE_SCRIPT;
if (script === undefined) {
  process.stderr.write("KNORVIA_PROBE_SCRIPT is required\n");
  process.exit(2);
}

const { bootKernel } = await import(pathToFileURL(kernelEntry).href);

const host = await bootKernel({ cwd: process.cwd(), env: process.env });

try {
  const shell = host.context.get("shell");
  if (shell === undefined) {
    process.stderr.write("ctx.shell is not mounted\n");
    process.exit(3);
  }
  const execution = await shell.execute(shell.resolve({ command: script }));
  const result = await execution.result();
  const stdout = result.stdout;
  const body = typeof stdout === "string" ? stdout : (stdout?.text ?? "");
  process.stdout.write(body);
  if (result.exitCode !== 0) {
    process.stderr.write(`shell command exited ${result.exitCode}\n`);
    process.exitCode = 4;
  }
} finally {
  await host.dispose();
}
