// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 合同的 golden 语料：输入工作流脚本 + 期望分类（聚合入口）。
//
// 语料按族拆在 fixtures/families/<family>.mjs（oxlint max-lines 上限 400 行/文件），
// 本文件只做聚合与不变量检查：样例 id 全局唯一、expect 只取两值、总数 ≥300。
//
// 这里只定义**输入**；期望输出由 tests/record-golden.mjs 在旧实现上一次性录制
//（键序、字段、边界全以旧实现为准），落盘为 fixtures/golden/<family>.json。
// 每条样例的 `expect` 是语料作者对结果的分类断言（"clean" = ok 为真且零诊断，
// "diagnostics" = ok 为假），回放测试会同时校验它，防止该族样例静默跑偏。
//
// 语料来源：现有 core 测试夹具脚本（legacy / settle 族）+ 按计划书选择 10 构造的
// 边界样例（循环、异步、扇出、异常路径、阶段标记、产物、taint、误用、编译错误）。

import { samples as actors } from "./families/actors.mjs";
import { samples as artifacts } from "./families/artifacts.mjs";
import { samples as asyncSamples } from "./families/async.mjs";
import { samples as basic } from "./families/basic.mjs";
import { samples as combined } from "./families/combined.mjs";
import { samples as control } from "./families/control.mjs";
import { samples as errors } from "./families/errors.mjs";
import { samples as fanout } from "./families/fanout.mjs";
import { samples as joins } from "./families/joins.mjs";
import { samples as legacy } from "./families/legacy.mjs";
import { samples as loops } from "./families/loops.mjs";
import { samples as misuse } from "./families/misuse.mjs";
import { samples as phases } from "./families/phases.mjs";
import { samples as settle } from "./families/settle.mjs";
import { samples as taint } from "./families/taint.mjs";
import { samples as world } from "./families/world.mjs";

/** @typedef {{ id: string, script: string, expect: "clean" | "diagnostics" }} Sample */

/** @type {Sample[]} */
export const samples = [
  ...legacy,
  ...basic,
  ...phases,
  ...fanout,
  ...joins,
  ...asyncSamples,
  ...loops,
  ...control,
  ...world,
  ...artifacts,
  ...actors,
  ...misuse,
  ...taint,
  ...errors,
  ...combined,
  ...settle,
];

export const sampleCount = samples.length;

if (process.env.DWF01_CORPUS_CHECK === "1") {
  const ids = new Set();
  for (const sample of samples) {
    if (ids.has(sample.id)) throw new Error(`duplicate id: ${sample.id}`);
    ids.add(sample.id);
    if (sample.expect !== "clean" && sample.expect !== "diagnostics") {
      throw new Error(`bad expect for ${sample.id}: ${sample.expect}`);
    }
    if (typeof sample.script !== "string") throw new Error(`bad script for ${sample.id}`);
  }
  if (samples.length < 300)
    throw new Error(`corpus must have >= 300 samples, got ${samples.length}`);
  const families = new Map();
  for (const sample of samples) {
    const family = sample.id.split("/")[0];
    families.set(family, (families.get(family) ?? 0) + 1);
  }
  console.log(`samples: ${samples.length}`);
  for (const [family, count] of families) console.log(`  ${family}: ${count}`);
}
