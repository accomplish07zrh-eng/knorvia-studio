// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：模块路径面、导出面与根桶可达性（B27）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { barrel, loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual } from "./fixtures.mjs";

const appendix = JSON.parse(
  readFileSync(fileURLToPath(new URL("../interface-appendix.json", import.meta.url)), "utf8"),
);
const scope = JSON.parse(
  readFileSync(fileURLToPath(new URL("../scope-files.json", import.meta.url)), "utf8"),
);

// 两个模块不在根 barrel：model-config 走子路径入口，model-execution 走 protocol 内部。
const BARREL_EXCEPTIONS = new Set([
  "packages/shared/src/model-config.ts",
  "packages/shared/src/model-execution.ts",
]);

const expectedRuntimeNames = (file) => {
  const names = [...file.runtime];
  for (const reexport of file.reexportNamed) {
    for (const name of reexport.names) {
      if (!name.startsWith("type ")) names.push(name);
    }
  }
  return names.sort();
};

test(`B27 模块路径面：44 个模块在 ${entryLabel} 入口均可加载且导出集合与附录一致`, async () => {
  assert.equal(appendix.files.length, 44);
  let runtimeTotal = 0;
  for (const file of appendix.files) {
    const relative = file.path.replace(/^packages\/shared\/src\//u, "");
    const module = await loadModule(relative);
    const actual = Object.keys(module)
      .filter((name) => name !== "default")
      .sort();
    assertJsonEqual(actual, expectedRuntimeNames(file), `${relative} 运行时导出面`);
    runtimeTotal += file.runtime.length;
  }
  assert.equal(appendix.totalRuntime, runtimeTotal);
  assert.equal(runtimeTotal, 204);
  assert.equal(appendix.totalTypes, 152);
});

test("B27 三个纯类型模块不暴露运行时值（update/remote-sync/intranetProbe）", async () => {
  for (const relative of ["update.ts", "remote-sync.ts", "intranetProbe.ts"]) {
    const module = await loadModule(relative);
    assertJsonEqual(Object.keys(module), [], `${relative} 应为纯类型模块`);
  }
});

test("B27 node 子路径桶再导出 10 个运行时值", async () => {
  const module = await loadModule("node.ts");
  assertJsonEqual(Object.keys(module).sort(), [
    "NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS",
    "acquireFileLock",
    "atomicWritePrivateTextFile",
    "backupCorruptFile",
    "createNodeSelfResourceSampler",
    "migrateSubagentStateFile",
    "migrateUserSubagentMarkdown",
    "resolveKnorviaDataRoot",
    "scanOfficialPluginCacheRoots",
    "withFileLock",
  ]);
});

test("B27 根 barrel 可达性：除两个例外外全部运行时导出逐名存在", () => {
  const barrelNames = new Set(Object.keys(barrel));
  let checked = 0;
  for (const file of appendix.files) {
    if (BARREL_EXCEPTIONS.has(file.path)) continue;
    for (const name of file.runtime) {
      assert.ok(barrelNames.has(name), `${file.path} 的导出 ${name} 应可从根 barrel 取到`);
      checked += 1;
    }
  }
  assert.ok(checked >= 150, `应核对至少 150 个运行时导出，实际 ${checked}`);
});

test("B27 两个例外：model-config 导出面经子路径、model-execution 不进根桶", () => {
  for (const file of appendix.files) {
    if (!BARREL_EXCEPTIONS.has(file.path)) continue;
    for (const name of file.runtime) {
      assert.equal(name in barrel, false, `${name} 不应出现在根 barrel`);
    }
  }
});

test("B27 scope-files.json 覆盖 44 件且分类计数一致", () => {
  assert.equal(scope.contract, "shared-04");
  assert.equal(scope.total, 44);
  assert.equal(scope.files.length, 44);
  const counts = {};
  for (const file of scope.files) {
    counts[file.classification] = (counts[file.classification] ?? 0) + 1;
  }
  assertJsonEqual(counts, scope.counts);
  assert.equal(counts["upstream-modified"] + counts["upstream-unchanged"], 44);
});
