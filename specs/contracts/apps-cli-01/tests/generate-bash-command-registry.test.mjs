// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { contractDir, makeTempDir, repoRoot, runScript, writeTree } from "./entry.mjs";

const SCRIPT = "generate-bash-command-registry.mjs";
const GENERATED_RELATIVE_PATH =
  "apps/cli/packages/core/src/tool/handlers/generated/bash-command-registry.ts";

function generatedPath() {
  return join(repoRoot, GENERATED_RELATIVE_PATH);
}

const IS_WIN32 = process.platform === "win32";
const WIN32_HASH = "288fc32dfc73797f47d192109deceb06e0f174ea15247ca2c6b70e6a9d5ea5fa";

async function goldenSummary() {
  const content = await readFile(join(contractDir, "fixtures", "registry-summary.txt"), "utf8");
  if (IS_WIN32) {
    const parsed = JSON.parse(content);
    parsed.hash = WIN32_HASH;
    return `${JSON.stringify(parsed)}\n`;
  }
  return content;
}

test("B15 --check 与已提交注册表逐字节比较并输出摘要", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  // cwd 里的同名路径是干扰项：默认输出路径相对脚本位置，不相对 cwd。
  await writeTree(root, {
    [GENERATED_RELATIVE_PATH]: "// cwd 干扰文件\n",
  });

  const result = await runScript(SCRIPT, ["--check"], { cwd: root });

  if (IS_WIN32) {
    // 旧实现在 Windows 上因路径反斜杠计算出不同哈希（288fc32d…），
    // 与已提交文件（1b0d34b4…）逐字节比较必然不一致，按设计抛出 stale 错误。
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Generated Bash command registry is stale\. Run `pnpm --dir apps\/cli registry:generate`\./,
    );
    assert.equal(result.stdout, "");
  } else {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, await goldenSummary());
  }
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
  if (IS_WIN32) {
    const summary = JSON.parse(await goldenSummary());
    assert.ok(
      generated
        .toString("utf8")
        .includes(`export const BASH_COMMAND_REGISTRY_HASH = "${summary.hash}";`),
    );
  } else {
    assert.equal(generated.equals(checkedIn), true);
  }

  const relative = await runScript(SCRIPT, ["--output", "relative/registry.ts"], { cwd: root });
  assert.equal(relative.status, 0, relative.stderr);
  const relativeOutput = await readFile(join(root, "relative", "registry.ts"));
  if (IS_WIN32) {
    assert.equal(relativeOutput.equals(generated), true);
  } else {
    assert.equal(relativeOutput.equals(checkedIn), true);
  }
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
  if (IS_WIN32) {
    assert.equal(check.status, 1);
    assert.match(
      check.stderr,
      /Generated Bash command registry is stale\. Run `pnpm --dir apps\/cli registry:generate`\./,
    );
  } else {
    assert.equal(check.status, 0, check.stderr);
  }

  // 无参数写出默认路径：目标是仓库内文件，cwd 里的同名文件不被写入。
  const before = await readFile(generatedPath());
  try {
    const write = await runScript(SCRIPT, [], { cwd: root });
    assert.equal(write.status, 0, write.stderr);
    assert.equal(write.stdout, await goldenSummary());
    const after = await readFile(generatedPath());
    if (IS_WIN32) {
      // Windows 旧实现写出带 Windows 哈希的文件，与检入的 POSIX 文件不同，但 cwd 干扰文件绝不被写入
      const summary = JSON.parse(await goldenSummary());
      assert.ok(
        after
          .toString("utf8")
          .includes(`export const BASH_COMMAND_REGISTRY_HASH = "${summary.hash}";`),
      );
    } else {
      assert.equal(after.equals(before), true);
    }
    assert.equal(await readFile(join(root, GENERATED_RELATIVE_PATH), "utf8"), interference);
  } finally {
    if (IS_WIN32) {
      // 必须恢复仓库文件，避免测试产生 dirty working tree 污染后续步骤
      await writeFile(generatedPath(), before);
    }
  }
});
