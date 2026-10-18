// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-02 golden 录制器：在**旧实现**上跑 fixtures/corpus.mjs 的全部样例，把
// 每个样例的输出录进 fixtures/golden/<族>.json。契约测试回放时逐字节比对——新实现只要产出
// 不同就红。这是本包的核心门槛（计划书选择 10：输入脚本 → lowering 与整轮运行的 golden 样例）。
//
// 两份录制，各管一半：
//   lowering.json   全部 350 条（dw01 复用的 324 条 + 本包自有的 engine-run 26 条）：
//                   lowerWorkflowScript 的诊断、站点表、降级代码文本。
//   engine-run.json 只含 engine-run 族：整轮 run 的结局、事件轨、journal 行、driver 收到的效应。
//                   静态那一半不在这里重复一遍——两份真相迟早分叉，分叉那天红的是不该红的那份。
//
// 只走公开入口（entry.mjs），黑盒录制；录制固定用源码入口（旧实现本身），所以这里显式挡掉
// KNORVIA_DW02_ENTRY=dist：产物是源码的编译结果，拿它当基准录 golden 等于让实现自证。
//
// 用法（仓库根目录，Node 24）：
//   node --import tsx specs/contracts/dynamic-workflow-02/tests/record-golden.mjs
//   npx oxfmt specs/contracts/dynamic-workflow-02/fixtures/golden/*.json
// 第二行不是可选项：JSON.stringify 的 2 空格缩进不会把短数组并成一行，与本仓库的 oxfmt
// 规则不同形，漏了它 `pnpm fmt:check` 就红。格式化只动文本，回放比对的是 parse 后的对象。
// 合同合并后任何语料/录制改动都要重跑旧门并升版本（README 顶部）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { entryLabel } from "./entry.mjs";
import { loweringRecord, runEngineSample } from "./harness.mjs";

if (entryLabel !== "source") {
  throw new Error(
    `录制必须在源码入口上进行（当前 KNORVIA_DW02_ENTRY=${entryLabel}）：golden 的基准是旧实现本身，不是它的编译产物`,
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../fixtures/golden");
const { runSamples, samples } = await import(new URL("../fixtures/corpus.mjs", import.meta.url));

const lowering = { family: "lowering", samples: samples.map((sample) => loweringRecord(sample)) };
const engineRun = { family: "engine-run", samples: [] };
for (const sample of runSamples) {
  engineRun.samples.push(await runEngineSample(sample));
}

mkdirSync(goldenDir, { recursive: true });
let totalBytes = 0;
for (const payload of [lowering, engineRun]) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(join(goldenDir, `${payload.family}.json`), text, "utf8");
  totalBytes += Buffer.byteLength(text, "utf8");
  console.log(
    `record-golden: ${payload.family}.json ${payload.samples.length} 例 / ${(Buffer.byteLength(text, "utf8") / 1024).toFixed(0)} KB`,
  );
}
console.log(`record-golden: 合计 ${(totalBytes / 1024).toFixed(0)} KB -> fixtures/golden/`);
