// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { contractDir, makeTempDir, repoRoot, runScript, writeTree } from "./entry.mjs";

const SCRIPT = "generate-bash-command-registry.mjs";
const GENERATED_RELATIVE_PATH =
  "apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts";

function generatedPath() {
  return join(repoRoot, GENERATED_RELATIVE_PATH);
}

async function goldenSummary() {
  return readFile(join(contractDir, "fixtures", "registry-summary.txt"), "utf8");
}

test("B15 --check 与已提交注册表逐字节比较并输出摘要", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  // cwd 里的同名路径是干扰项：默认输出路径相对脚本位置，不相对 cwd。
  await writeTree(root, {
    [GENERATED_RELATIVE_PATH]: "// cwd 干扰文件\n",
  });

  const result = await runScript(SCRIPT, ["--check"], { cwd: root });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, await goldenSummary());
});

test("B16 --output 写出与仓库文件逐字节相同的注册表、相对 cwd 解析并创建父目录", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "deep", "nested", "bash-command-registry.ts");

  const result = await runScript(SCRIPT, ["--output", output], { cwd: contractDir });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, await goldenSummary());
  const [generated, checkedIn] = await Promise.all([readFile(output), readFile(generatedPath())]);
  assert.equal(generated.equals(checkedIn), true);

  const relative = await runScript(SCRIPT, ["--output", "relative/registry.ts"], { cwd: root });
  assert.equal(relative.status, 0, relative.stderr);
  const relativeOutput = await readFile(join(root, "relative", "registry.ts"));
  assert.equal(relativeOutput.equals(checkedIn), true);
});

test("B17 生成幂等：两次 --output 字节一致", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = join(root, "first.ts");
  const second = join(root, "second.ts");

  const firstRun = await runScript(SCRIPT, ["--output", first], { cwd: root });
  const secondRun = await runScript(SCRIPT, ["--output", second], { cwd: root });

  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(secondRun.status, 0, secondRun.stderr);
  const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
  assert.equal(firstBytes.equals(secondBytes), true);
});

test("B18 输出模板与跨平台内容哈希", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "registry.ts");

  const result = await runScript(SCRIPT, ["--output", output], { cwd: root });
  assert.equal(result.status, 0, result.stderr);

  const summary = JSON.parse(await goldenSummary());
  const text = await readFile(output, "utf8");
  const lines = text.split("\n");
  assert.equal(lines[0], "/* eslint-disable */");
  assert.equal(
    lines[1],
    "// 此文件由 scripts/generate-bash-command-registry.mjs 确定性生成，请勿手改。",
  );
  assert.equal(
    lines[2],
    `// Source: @withfig/autocomplete@${summary.figVersion} (ISC); hash: ${summary.hash}.`,
  );
  assert.equal(
    lines[3],
    `// Skipped: imports=${summary.skipped.imports}, dynamicSubcommands=${summary.skipped.dynamicSubcommands}, invalidNodes=${summary.skipped.invalidNodes}, loadSpecNodes=${summary.skipped.loadSpecNodes}.`,
  );
  assert.equal(
    lines[4],
    "export type BashCommandRegistryOption = readonly [readonly string[], 0 | 1];",
  );
  assert.equal(text.endsWith("\n"), true);
  assert.ok(text.includes(`export const BASH_COMMAND_REGISTRY_HASH = "${summary.hash}";`));
  assert.ok(
    text.includes(`export const BASH_COMMAND_REGISTRY_VERSION = "fig-${summary.figVersion}";`),
  );
});

test("B19 默认输出路径固定相对脚本位置而不是 cwd", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const interference = "// cwd 干扰文件\n";
  await writeTree(root, {
    [GENERATED_RELATIVE_PATH]: interference,
  });

  const check = await runScript(SCRIPT, ["--check"], { cwd: root });
  assert.equal(check.status, 0, check.stderr);

  // 无参数写出默认路径：目标是仓库内文件（内容确定、保持不变），cwd 里的同名文件不被写入。
  const before = await readFile(generatedPath());
  const write = await runScript(SCRIPT, [], { cwd: root });
  assert.equal(write.status, 0, write.stderr);
  assert.equal(write.stdout, await goldenSummary());
  const after = await readFile(generatedPath());
  assert.equal(after.equals(before), true);
  assert.equal(await readFile(join(root, GENERATED_RELATIVE_PATH), "utf8"), interference);
});
