// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  callExport,
  contractDir,
  makeTempDir,
  runInlineModule,
  runScript,
  scriptPath,
  writeTree,
} from "./entry.mjs";

const SCRIPT = "count-ts-lines.mjs";

async function makeTreeFixture(t) {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = JSON.parse(
    await readFile(join(contractDir, "fixtures", "count-lines-tree.json"), "utf8"),
  );
  await writeTree(root, files);
  // 符号链接在 Windows 上可能需要额外权限；创建失败时同一断言仍然覆盖“只收集普通文件”。
  await symlink(join(root, "src"), join(root, "linked-directory"), "dir").catch(() => {});
  await symlink(join(root, "src", "a.ts"), join(root, "linked-file.ts")).catch(() => {});
  return root;
}

test("B4 countLines：空文件、尾换行与 CRLF 归一", async () => {
  const cases = [
    ["", 0],
    ["\n", 1],
    ["\n\n", 2],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\r\nb\r\n", 2],
  ];
  for (const [source, expected] of cases) {
    assert.equal(await callExport(SCRIPT, "countLines", source), expected, JSON.stringify(source));
  }
});

test("B5 isTestSourceFile：测试目录段与测试后缀", async () => {
  const expected = new Map([
    ["src/tests/a.ts", true],
    ["src/__tests__/a.ts", true],
    ["src/a.test.ts", true],
    ["src/a.spec.tsx", true],
    ["src\\tests\\windows.ts", true],
    ["src/a.ts", false],
    ["src/test.ts", false],
    ["src/contest.ts", false],
    ["src/tests.ts", false],
  ]);
  for (const [filePath, isTest] of expected) {
    assert.equal(await callExport(SCRIPT, "isTestSourceFile", filePath), isTest, filePath);
  }
});

test("B6 isCountedSourceFile：只计 .ts/.tsx，排除测试文件", async () => {
  const expected = new Map([
    ["src/a.ts", true],
    ["src/a.tsx", true],
    ["src/a.mts", false],
    ["src/a.cts", false],
    ["src/a.js", false],
    ["src/a.spec.ts", false],
    ["src/tests/a.ts", false],
  ]);
  for (const [filePath, counted] of expected) {
    assert.equal(await callExport(SCRIPT, "isCountedSourceFile", filePath), counted, filePath);
  }
});

test("B7/B8 collectTypeScriptFiles：排序、忽略目录、测试目录与符号链接", async (t) => {
  const root = await makeTreeFixture(t);
  const files = await callExport(SCRIPT, "collectTypeScriptFiles", root);

  const relativePaths = files.map((file) => file.relativePath);
  assert.deepEqual(relativePaths, ["src/a.ts", "src/b.tsx", "src/empty.ts", "src/nested/g.tsx"]);
  for (const file of files) {
    assert.ok(file.absolutePath.startsWith(root), file.absolutePath);
    assert.equal(file.relativePath.includes("\\"), false, file.relativePath);
  }
});

test("B9 measureTypeScriptFiles：行数与 UTF-8 字节数", async (t) => {
  const root = await makeTreeFixture(t);
  const measurements = await callExport(SCRIPT, "measureTypeScriptFiles", root);

  const rows = measurements.map(({ relativePath, lines, bytes }) => ({
    relativePath,
    lines,
    bytes,
  }));
  assert.deepEqual(rows, [
    { relativePath: "src/a.ts", lines: 2, bytes: 4 },
    { relativePath: "src/b.tsx", lines: 2, bytes: 4 },
    { relativePath: "src/empty.ts", lines: 0, bytes: 0 },
    { relativePath: "src/nested/g.tsx", lines: 1, bytes: 3 },
  ]);
});

test("B10 formatReport：按行数排序、列宽、合计、空输入与结尾换行", async (t) => {
  const root = await makeTreeFixture(t);
  const measurements = await callExport(SCRIPT, "measureTypeScriptFiles", root);
  const golden = await readFile(join(contractDir, "fixtures", "count-lines-report.txt"), "utf8");

  assert.equal(await callExport(SCRIPT, "formatReport", measurements), golden);
  assert.equal(
    await callExport(SCRIPT, "formatReport", []),
    "TypeScript file lengths (.ts, .tsx)\nFiles: 0\nTotal lines: 0\nTotal bytes: 0\n\nLines  Bytes  File\n",
  );
});

test("B11/B12 CLI：根参数、默认 cwd 与多余参数", async (t) => {
  const root = await makeTreeFixture(t);
  const golden = await readFile(join(contractDir, "fixtures", "count-lines-report.txt"), "utf8");

  const byArgument = await runScript(SCRIPT, [root], { cwd: contractDir });
  assert.equal(byArgument.status, 0);
  assert.equal(byArgument.stderr, "");
  assert.equal(byArgument.stdout, golden);

  const byDefault = await runScript(SCRIPT, [], { cwd: root });
  assert.equal(byDefault.status, 0);
  assert.equal(byDefault.stderr, "");
  assert.equal(byDefault.stdout, golden);

  const extraArguments = await runScript(SCRIPT, [root, "ignored"], { cwd: contractDir });
  assert.equal(extraArguments.status, 0);
  assert.equal(extraArguments.stdout, golden);
});

test("B13 CLI 失败：stderr 前缀与退出码", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const missing = join(root, "missing-directory");

  const result = await runScript(SCRIPT, [missing], { cwd: root });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith("lint:count failed: "), result.stderr);
  assert.ok(result.stderr.includes("missing-directory"), result.stderr);
});

test("B14 导入模块不触发扫描，导出函数可直接调用", async (t) => {
  const root = await makeTempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeTree(root, { "src/only.ts": "a\n" });
  const source = [
    `const module = await import(${JSON.stringify(pathToFileURL(scriptPath(SCRIPT)).href)});`,
    `process.stdout.write(JSON.stringify({ count: module.countLines(${JSON.stringify("a\n")}) }));`,
  ].join("\n");

  const result = await runInlineModule(source, { cwd: root });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, '{"count":1}');
});
