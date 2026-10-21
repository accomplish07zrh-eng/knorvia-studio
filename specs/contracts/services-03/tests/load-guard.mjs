// 给 purity/dependencies 的静态断言统一加「运行期可加载」前置：
// 桩替换后模块 import 即抛 → 前置失败 → 该用例整体失败 → allFail 成立。
//
// 这是服务 services-02 的教训（见 known-differences.md K1）：
// 契约包的断言大量是静态分析，桩替换只改模块顶层，
// 于是纯静态断言在桩下照样成立，旧门 allFail 防线失效。
import assert from "node:assert/strict";

import { scope } from "./scope.mjs";
import { assertLoadable } from "./runtime-guard.mjs";

let loaded = false;

/**
 * 确保全部 31 个模块在本进程内可加载。**只做一次**（模块缓存）。
 *
 * 任何对本层源码做静态断言的用例，开头都应 `await ensureLoadable()`：
 * 这样桩替换时（模块顶层 throw）守卫先失败，静态断言不会「在桩上通过」。
 */
export async function ensureLoadable() {
  if (loaded) return;
  const failures = [];
  for (const row of scope) {
    try {
      await assertLoadable(row);
    } catch (error) {
      failures.push(`${row.modulePath}: ${String(error.message).split("\n")[0]}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `以下模块无法加载（静态断言不能替代运行期可用性）：\n${failures.join("\n")}`,
  );
  loaded = true;
}
