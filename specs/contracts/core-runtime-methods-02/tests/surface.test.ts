// SPDX-License-Identifier: Apache-2.0
// surface 契约：interface.md 的 24 模块 / 98 导出逐名对照 + 模块路径可导入。用例名与 README
// 对照表逐字一致（发布后不改）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadEntryModules, MODULE_PATHS } from "./entry.mjs";

test("interface.md × 运行时导出：24 模块 / 98 导出逐名一致", async () => {
  const text = readFileSync(new URL("../interface.md", import.meta.url), "utf8");
  const rows: Array<[string, string, boolean]> = [];
  for (const line of text.split("\n")) {
    const match = /^\| `([^`]+\.ts)` \| `([^`]+)` \| ([a-z/]+) \| (是|否) \|/.exec(line);
    if (match) rows.push([match[1], match[2], match[4] === "是"]);
  }
  assert.equal(rows.length, 98);
  const modules = await loadEntryModules();
  const seen = new Set<string>();
  for (const [modulePath, exportName, runtimeValue] of rows) {
    const key = modulePath.replace(/\.ts$/, "");
    const module = (modules as Record<string, Record<string, unknown>>)[key];
    assert.ok(module, `模块未加载：${modulePath}`);
    seen.add(key);
    // 纯类型导出在运行时不可取值；其兼容面由 interface.md 的签名（声明层）锁定。
    if (runtimeValue) {
      assert.ok(exportName in module, `导出缺失：${modulePath}#${exportName}`);
    }
  }
  assert.equal(seen.size, 24);
});

test("24 个模块路径均可按公开路径导入，且入口取值受控", async () => {
  assert.equal(MODULE_PATHS.length, 24);
  const modules = (await loadEntryModules()) as Record<string, Record<string, unknown>>;
  for (const key of MODULE_PATHS) {
    assert.ok(modules[key], `模块未加载：${key}`);
  }
});
