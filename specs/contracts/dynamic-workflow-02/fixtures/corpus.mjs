// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 golden 语料的聚合入口（**输入**；期望输出由 tests/record-golden.mjs
// 在旧实现上录制进 fixtures/golden/）。
//
// 两个来源：
//  1. **dynamic-workflow-01 的 324 条样例**：按计划书"行为直接复用已有 specs/contracts/*"，
//     这里以相对路径 import 同一份数据，不复制第二份真相（复制出的两份语料迟早分叉，
//     分叉那天 lowering 的覆盖面就悄悄缩水了）。dw01 的合同只管静态分析；同一批输入过
//     lowering 与 schema 合成会得到**另一组**输出，那正是本包要钉的东西。
//     为防上游语料在无人重录 golden 时变动，这里对"条数 + 逐条 (id,expect,script) 摘要"
//     做无环境开关的硬校验：不一致就抛，测试全红，逼一次重录 + 升版本。
//  2. **engine-run 族**（本包自有）：dw01 的样例只要求编译干净，这一族还要求运行期有
//     确定结局，故额外带一份 drive 表。见 families/engine-run.mjs 头部。
//
// 自检（人工核对语料规模时用，不改变加载语义）：
//   DWF02_CORPUS_CHECK=1 node --import tsx specs/contracts/dynamic-workflow-02/fixtures/corpus.mjs

import { createHash } from "node:crypto";

import { samples as dw01Samples } from "../../dynamic-workflow-01/fixtures/corpus.mjs";
import { samples as engineRunSamples } from "./families/engine-run.mjs";

/**
 * dw01 语料指纹：条数 + sha256（对每条 `id\u0000expect\u0000script`、以换行连接后取摘要）。
 * 录制日期 2026-10-18，基线 commit 3e9505cd（dynamic-workflow-01 合并）。
 */
export const dw01CorpusPin = {
  count: 324,
  sha256: "3c79bc18c0175c7b8e46f09205ef74269029c5322dd4edbe8cbda66b4fe1cf7a",
};

function digestOf(samples) {
  const text = samples.map((s) => `${s.id}\u0000${s.expect}\u0000${s.script}`).join("\n");
  return createHash("sha256").update(text).digest("hex");
}

if (dw01Samples.length !== dw01CorpusPin.count || digestOf(dw01Samples) !== dw01CorpusPin.sha256) {
  throw new Error(
    `dynamic-workflow-01 语料与本包 golden 的指纹不一致（条数 ${dw01Samples.length}/${dw01CorpusPin.count}）：` +
      "上游语料变了 → 重跑 record-golden 并升本合同版本（README 顶部），不要改这里的指纹迁就。",
  );
}

/** @typedef {{ id: string, script: string, expect: "clean" | "diagnostics" }} Sample */
/** @typedef {{ id: string, script: string, expect: "clean", drive: Record<string, unknown> }} RunSample */

/** 带运行期结局的样例（engine-run 族）。 */
export const runSamples = engineRunSamples;

/** 全部样例：静态 lowering/schema golden 按这一份录制。 */
export const samples = [...dw01Samples, ...engineRunSamples];

export const sampleCount = samples.length;

const ids = new Set();
for (const sample of samples) {
  if (ids.has(sample.id)) throw new Error(`duplicate id: ${sample.id}`);
  ids.add(sample.id);
  if (sample.expect !== "clean" && sample.expect !== "diagnostics") {
    throw new Error(`bad expect for ${sample.id}: ${sample.expect}`);
  }
  if (typeof sample.script !== "string") throw new Error(`bad script for ${sample.id}`);
}
for (const sample of engineRunSamples) {
  if (sample.expect !== "clean") throw new Error(`engine-run sample must be clean: ${sample.id}`);
  if (sample.drive === null || typeof sample.drive !== "object") {
    throw new Error(`engine-run sample needs a drive table: ${sample.id}`);
  }
}

if (process.env.DWF02_CORPUS_CHECK === "1") {
  const families = new Map();
  for (const sample of samples) {
    const family = sample.id.split("/")[0];
    families.set(family, (families.get(family) ?? 0) + 1);
  }
  console.log(`samples: ${samples.length} (runnable: ${engineRunSamples.length})`);
  for (const [family, count] of families) console.log(`  ${family}: ${count}`);
}
