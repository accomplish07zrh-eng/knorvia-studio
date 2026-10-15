// SPDX-License-Identifier: Apache-2.0
// shared-01 契约测试：公开入口导出面与模块路径兼容面（B43–B44）。
// 导出集合以 interface.md / interface-appendix-protocol-v4.md（机器生成）为准，两个入口逐名比对。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { entryLabel, protocolV4, repoRoot, sharedNode } from "./entry.mjs";
import { fixtures } from "./fixtures.mjs";

const RUNTIME_KINDS = new Set(["const", "function", "class"]);

function parseProtocolAppendix() {
  const text = readFileSync(
    join(repoRoot, "specs/contracts/shared-01/interface-appendix-protocol-v4.md"),
    "utf8",
  );
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*(\w+)\s*\|\s*$/u.exec(line);
    if (match) rows.push({ name: match[1], kind: match[2] });
  }
  return rows;
}

function parseNodeInterface() {
  const text = readFileSync(join(repoRoot, "specs/contracts/shared-01/interface.md"), "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*$/u.exec(line);
    if (match) rows.push({ name: match[1], kind: match[2], declaredIn: match[3] });
  }
  return rows;
}

test("B43 protocol-v4 入口导出面：与附录 571 项逐名一致（运行时值 314 个）", () => {
  const rows = parseProtocolAppendix();
  assert.equal(rows.length, 571, "附录共 571 项");
  const kinds = rows.reduce(
    (counts, row) => ({ ...counts, [row.kind]: (counts[row.kind] ?? 0) + 1 }),
    {},
  );
  assert.deepEqual(
    kinds,
    { const: 276, function: 35, class: 3, type: 247, interface: 10 },
    "种类分布是契约",
  );

  const runtimeNames = rows.filter((row) => RUNTIME_KINDS.has(row.kind)).map((row) => row.name);
  assert.equal(runtimeNames.length, 314, "运行时值 314 个");
  const actual = Object.keys(protocolV4).sort();
  assert.deepEqual(
    actual,
    [...runtimeNames].sort(),
    `@knorvia/shared/protocol-v4 的运行时导出集合必须与附录一致（入口：${entryLabel}）`,
  );
});

test("B43 node 入口导出面：interface.md 13 项中 10 个运行时值", () => {
  const rows = parseNodeInterface().filter((row) => row.declaredIn === "src/node.ts");
  assert.equal(rows.length, 13, "interface.md 的 node 表共 13 项");
  const runtimeNames = rows.filter((row) => RUNTIME_KINDS.has(row.kind)).map((row) => row.name);
  assert.equal(runtimeNames.length, 10, "运行时值 10 个");
  assert.deepEqual(
    Object.keys(sharedNode).sort(),
    [...runtimeNames].sort(),
    `@knorvia/shared/node 的导出集合（入口：${entryLabel}）`,
  );
  for (const name of runtimeNames) {
    assert.notEqual(sharedNode[name], undefined, `${name} 必须是可取到的运行时值`);
  }
  assert.equal(
    sharedNode.NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS,
    60_000,
    "自采周期常量取值也是导出面的一部分",
  );
});

test("B44 模块路径兼容面：两个桶与 27 个继承模块在源码侧存在，dist 入口时产物也在", () => {
  const barrels = ["packages/shared/src/node.ts", "packages/shared/src/protocol-v4/index.ts"];
  for (const relative of barrels) {
    assert.ok(existsSync(join(repoRoot, relative)), `源码桶缺失：${relative}`);
  }
  const scope = JSON.parse(
    readFileSync(join(repoRoot, "specs/contracts/shared-01/scope-files.json"), "utf8"),
  );
  const inherited = scope.files.filter((file) => file.classification !== "unreviewed");
  assert.equal(inherited.length, 27, "本包继承文件 27 个");
  for (const file of inherited) {
    assert.ok(existsSync(join(repoRoot, file.path)), `继承模块缺失：${file.path}`);
  }
  if (entryLabel === "dist") {
    for (const relative of [
      "packages/shared/dist/node.js",
      "packages/shared/dist/protocol-v4/index.js",
    ]) {
      assert.ok(existsSync(join(repoRoot, relative)), `dist 入口产物缺失：${relative}`);
    }
  }
  assert.ok(fixtures.encodeCases.cases.length >= 7, "录制帧夹具随合同一起进入兼容面核对");
});
