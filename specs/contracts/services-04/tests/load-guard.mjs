// SPDX-License-Identifier: Apache-2.0
// 运行期守卫：每条静态断言前先证明模块能真实加载。
//
// 背景（见 known-differences.md K1 / K-z）：
// `services-04` 有 2 个包级聚合桶（`index.ts` / `node.ts`）**不在桩替换范围**。
// 桩替换 46 个实现文件后，聚合桶的 `export ... from "./xxx.js"` 会指向桩，
// 若桩的导出名与真实不符 → 聚合桶在 import 阶段就报错。
//
// 这带来两种合规的 allFail 形态（见 known-differences 的「失败类型分类」）：
//   A. 断言失败 —— 测试跑完，断言不成立
//   B. 加载失败 —— 模块（或引用它的聚合桶）在 import 阶段报错
//
// `ensureLoadable()` 让两种形态都可被观测：
//   · 真实实现 → 加载成功 → 继续断言；
//   · 桩       → 加载即抛 → 断言失败。
import assert from "node:assert/strict";

import { scopeRows } from "./scope.mjs";
import { assertLoadable } from "./runtime-guard.mjs";

let loaded = false;

/**
 * 确保全部 46 个实现文件在本进程内可加载。**只做一次**（模块缓存）。
 *
 * 任何对实现源码做静态断言的用例，开头都应 `await ensureLoadable()`。
 */
export async function ensureLoadable() {
  if (loaded) return;
  const failures = [];
  for (const row of scopeRows()) {
    try {
      await assertLoadable(row);
    } catch (error) {
      failures.push(`${row.name}: ${String(error.message).split("\n")[0]}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `以下模块无法加载（静态断言不能替代运行期可用性）：\n${failures.join("\n")}`,
  );
  loaded = true;
}

/** 仅检查本层模块自身可加载（不经过聚合桶）。 */
export async function loadableNames() {
  const ok = [];
  const failed = [];
  for (const row of scopeRows()) {
    try {
      await assertLoadable(row);
      ok.push(row.name);
    } catch (error) {
      failed.push({ name: row.name, error: String(error.message).split("\n")[0] });
    }
  }
  return { ok, failed };
}
