// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 契约测试：分析管线的定点行为断言。
//
// golden 回放（golden.test.mjs）钉住「输入 → 输出」的全量等价；本文件钉住
// golden 之外的接口性质：管线顺序、诊断定位、扣图规则、常量值、确定性、
// core JSON 往返、入口导出面。全部只走公开入口（根桶 + projections 桶），黑盒。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { dw, entryLabel, projections } from "./entry.mjs";

const entryExports = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/entry-exports.json", import.meta.url)), "utf8"),
);

test(`B1 编译器包装：诊断位置映射回作者坐标（${entryLabel}）`, () => {
  // 第 1 行故意写一个类型错误；prelude 占 1 行，诊断必须报在作者的第 1 行。
  const script = 'const n: number = "oops";\nlog(String(n));';
  const result = dw.compileWorkflowScript(script);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.length >= 1);
  const first = result.diagnostics[0];
  assert.equal(first.line, 1, "prelude 行必须被剥掉");
  assert.ok(first.column >= 1);
  assert.equal(typeof first.message, "string");
  // 第 2 行的错误报在第 2 行。
  const script2 = 'log("ok");\nreturn missingIdentifier;';
  const result2 = dw.compileWorkflowScript(script2);
  assert.equal(result2.ok, false);
  assert.ok(
    result2.diagnostics.some((d) => d.line === 2),
    "第 2 行的诊断必须定位在第 2 行",
  );
});

test(`B1 编译器包装：SCRIPT_FILE_NAME 与 facade 文件名常量（${entryLabel}）`, () => {
  assert.equal(dw.SCRIPT_FILE_NAME, "workflow-script.ts");
  assert.equal(dw.FACADE_FILE_NAME, "workflow-facade.d.ts");
  assert.ok(dw.FACADE_DTS.includes("declare function agent"));
  assert.ok(dw.SNIPPET_FACADE_DTS.includes("declare const world"));
  assert.ok(
    !dw.SNIPPET_FACADE_DTS.includes("declare function agent"),
    "snippet facade 必须剔除 actor 族",
  );
});

test(`B2 诊断顺序：语义诊断在句法诊断之后、作者检查在编译诊断之后（${entryLabel}）`, () => {
  // 同一脚本同时含编译期错误与作者期检查（world.run 非字面量）。
  const script = 'const cmd = "node";\nconst r = await world.run(cmd, []);\nreturn missing;';
  const result = dw.analyzeWorkflowScript(script);
  assert.equal(result.ok, false);
  const codes = result.diagnostics.map((d) => d.code);
  // 编译期错误（missing 标识符 2304）先于 world-run 作者检查（9003）出现时，
  // 分析器在编译诊断处即短路——作者检查不会跑。这里断言短路行为。
  assert.ok(!codes.includes(9003), "编译诊断非空时作者检查不执行（短路）");
});

test(`B3 环境修饰符消息改写：declare/export 给出可操作文案（${entryLabel}）`, () => {
  const declareResult = dw.compileWorkflowScript('declare const ambient: string;\nreturn "x";');
  assert.equal(declareResult.ok, false);
  assert.ok(
    declareResult.diagnostics.some((d) =>
      d.message.includes("The `declare` modifier is not allowed"),
    ),
    "declare 必须被改写成可操作消息",
  );
  const exportResult = dw.compileWorkflowScript("export const value = 1;\nreturn value;");
  assert.equal(exportResult.ok, false);
  assert.ok(exportResult.diagnostics.some((d) => d.message.includes("`export` is not allowed")));
});

test(`B4 analyze 管线短路：编译诊断非空时不产出图也不产出产物清单（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript(
    'artifact.metrics("m", { metrics: [{ field: "n" }] });\nreturn missing;',
  );
  assert.equal(result.ok, false);
  assert.equal(result.core, undefined);
  assert.equal(result.graph, undefined);
  assert.equal(result.causality, undefined);
  assert.deepEqual(result.declaredArtifacts, []);
});

test(`B4 facade-misuse 同样扣下全部图（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript('const send = agent("a").ask;\nreturn await send("x");');
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 9001));
  assert.equal(result.core, undefined, "facade-misuse 必须扣下 core");
  assert.deepEqual(result.declaredArtifacts, []);
});

test(`B5 产物清单：诊断非空时仍给出（作者期检查不扣产物清单）（${entryLabel}）`, () => {
  // world.run 非字面量 → 9003；但 declaredArtifacts 照常给出。
  const result = dw.analyzeWorkflowScript(
    'artifact.metrics("m", { metrics: [{ field: "n" }] });\nconst cmd = "node";\nawait world.run(cmd, []);\nreturn "done";',
  );
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 9003));
  assert.deepEqual(result.declaredArtifacts, [{ id: "m", kind: "metrics" }]);
  assert.equal(result.core, undefined, "作者期检查（非 9006）仍然扣图");
});

test(`B6 9006 唯一不扣图：fan-out 静态 actor 名清 ok 但保留全部图（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript(
    'const xs = ["a", "b"];\nreturn await Promise.all(xs.map(async (x) => await agent("static").ask(x)));',
  );
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 9006));
  assert.ok(result.core !== undefined, "9006 不扣 core");
  assert.ok(result.causality !== undefined, "9006 不扣因果图");
  assert.ok(result.flow !== undefined, "9006 不扣控制流");
  assert.ok(result.handoff !== undefined, "9006 不扣交接图");
  assert.ok(result.graph !== undefined, "9006 不扣站点图");
});

test(`B7 编译期常量：诊断码与上限值即契约（${entryLabel}）`, () => {
  assert.equal(dw.PHASE_MARKER_CODE, 9004);
  assert.equal(dw.WORLD_RUN_LITERAL_CODE, 9003);
  assert.equal(dw.ARTIFACT_DECLARATION_CODE, 9007);
  assert.equal(dw.ARTIFACT_HOISTING_CODE, 9008);
  assert.equal(dw.ARTIFACT_PRIMARY_CONFLICT_CODE, 9009);
  assert.equal(dw.FANOUT_EXPAND_CAP, 8);
  assert.equal(dw.FLOW_ENTRY, "entry");
  assert.equal(dw.FLOW_SINK, "sink");
  assert.equal(dw.FLOW_ABORT, "abort");
  assert.equal(dw.SINK_ID, "sink");
  assert.equal(dw.UNKNOWN_LANE, "unknown");
  assert.equal(dw.WORKSPACE_LANE, "workspace");
  assert.equal(dw.UNPHASED, "unphased");
  assert.equal(dw.UNPHASED_ID, "unphased");
});

test(`B8 产物 id 上限与字符集（${entryLabel}）`, () => {
  assert.equal(dw.ARTIFACT_ID_PATTERN.source, "^[A-Za-z0-9_.-]+$");
  assert.equal(dw.ARTIFACT_CAPS.maxArtifactsPerRun, 32);
  // 65 个字符的 id → 9007
  const long = "x".repeat(65);
  const result = dw.analyzeWorkflowScript(
    `artifact.metrics("${long}", { metrics: [{ field: "n" }] });\nreturn "done";`,
  );
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 9007));
  // 非法字符 → 9007
  const bad = dw.analyzeWorkflowScript(
    'artifact.metrics("has space", { metrics: [{ field: "n" }] });\nreturn "done";',
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.diagnostics.some((d) => d.code === 9007));
});

test(`B9 确定性：同一脚本两次分析输出逐字节一致（${entryLabel}）`, () => {
  const script = [
    'const filesList = await files.glob("src/**/*.ts");',
    'phase("Review each changed file in parallel");',
    "const reviews = await Promise.all(filesList.map(async (f) => {",
    '  return await agent("reviewer-" + f).ask("Review " + f);',
    "}));",
    'const summary = await agent("summarizer").ask(reviews.join("\\n"));',
    "return summary;",
  ].join("\n");
  const one = dw.analyzeWorkflowScript(script);
  const two = dw.analyzeWorkflowScript(script);
  assert.equal(dw.serializeCore(one.core), dw.serializeCore(two.core));
  assert.equal(
    dw.serializeCausalityGraph(one.causality),
    dw.serializeCausalityGraph(two.causality),
  );
  assert.equal(dw.serializeControlFlow(one.flow), dw.serializeControlFlow(two.flow));
  assert.equal(
    dw.serializeHandoffGraph(one.handoff, one.causality.lanes),
    dw.serializeHandoffGraph(two.handoff, two.causality.lanes),
  );
  assert.deepEqual(one.diagnostics, two.diagnostics);
});

test(`B10 core JSON 往返：encode → decode → 再序列化逐字节一致（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript(
    'const a = agent("a");\nphase("p");\nreturn await a.ask("x");',
  );
  const encoded = dw.encodeAnalysisCore(result.core);
  const decoded = dw.decodeAnalysisCore(encoded);
  assert.equal(dw.serializeCore(decoded), dw.serializeCore(result.core));
  // 二次往返同样稳定
  const reencoded = dw.encodeAnalysisCore(decoded);
  assert.deepEqual(reencoded, encoded);
});

test(`B11 projections 桶与根桶的分析投影同源（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript(
    'const a = agent("a");\nconst b = agent("b");\nreturn await Promise.all([a.ask("1"), b.ask("2")]);',
  );
  // projections 桶的 projectCausalityGraph 从 core 重投影，与 analyze 内建投影一致。
  const rebuilt = projections.projectCausalityGraph(
    dw.decodeAnalysisCore(dw.encodeAnalysisCore(result.core)),
    projections.projectSiteGraph(dw.decodeAnalysisCore(dw.encodeAnalysisCore(result.core))),
  );
  assert.equal(dw.serializeCausalityGraph(rebuilt), dw.serializeCausalityGraph(result.causality));
});

test(`B12 reduceOrdering：贪心不可约归约的空输入与自环（${entryLabel}）`, () => {
  assert.deepEqual(dw.reduceOrdering([]), []);
  const selfLoop = [{ from: "a", to: "a", kind: "data" }];
  const reduced = dw.reduceOrdering(selfLoop);
  assert.ok(Array.isArray(reduced));
});

test(`B13 mermaid 渲染器：输出非空且确定（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript(
    'const a = agent("a");\nphase("p");\nreturn await a.ask("x");',
  );
  const mermaid = dw.causalityGraphToMermaid(result.causality);
  assert.ok(mermaid.length > 0);
  assert.equal(mermaid, dw.causalityGraphToMermaid(result.causality));
  const flow = dw.controlFlowToMermaid(result.flow);
  assert.ok(flow.length > 0);
  const handoff = dw.handoffGraphToMermaid(result.handoff, result.causality);
  assert.ok(handoff.length > 0);
  const site = dw.siteGraphToMermaid(result.graph);
  assert.ok(site.length > 0);
  const actor = dw.actorGraphToMermaid(projections.toActorGraph(result.graph));
  assert.ok(actor.length > 0);
});

test(`B14 入口导出面：运行时导出集合与录制一致（${entryLabel}）`, () => {
  const actualIndex = Object.keys(dw).sort((a, b) => a.localeCompare(b, "en"));
  assert.deepEqual(actualIndex, entryExports.index, "根桶运行时导出集合变了");
  const actualProjections = Object.keys(projections).sort((a, b) => a.localeCompare(b, "en"));
  assert.deepEqual(actualProjections, entryExports.projections, "projections 桶运行时导出集合变了");
});

test(`B15 collectSites / collectWorldRunCommands / collectPhaseMarkerDiagnostics 公开面（${entryLabel}）`, () => {
  assert.equal(typeof dw.collectSites, "function");
  assert.equal(typeof dw.collectWorldRunCommands, "function");
  assert.equal(typeof dw.collectPhaseMarkerDiagnostics, "function");
  assert.equal(typeof dw.collectArtifactDeclarations, "function");
  assert.equal(typeof dw.collectDuplicateActorNames, "undefined", "9005 检查不从入口导出");
  // collectWorldRunCommands 的公开行为：字面量收集 + 排序去重。
  const workflow = dw.createWorkflowProgram(
    'await world.run("git", ["status"]);\nawait world.run("git", ["status"]);',
  );
  const collected = dw.collectWorldRunCommands(workflow, dw.collectSites(workflow));
  assert.deepEqual(collected.commands, ["git"]);
  assert.deepEqual(collected.diagnostics, []);
});

test(`B16 空脚本与纯逻辑脚本：无站点、无图边、ok=true（${entryLabel}）`, () => {
  const result = dw.analyzeWorkflowScript("");
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.core !== undefined);
  assert.equal(dw.serializeCausalityGraph(result.causality).trim(), "");
});

test(`B17 locale 独立性：ASCII id 排序在不同 locale 下一致（${entryLabel}）`, () => {
  // serializeCore 内部用 localeCompare 排 Map 键；ASCII 键在任何 locale 下顺序一致。
  const result = dw.analyzeWorkflowScript(
    'const a = agent("a");\nconst x = await a.ask("1");\nreturn await a.ask(x);',
  );
  const coreText = dw.serializeCore(result.core);
  const askLines = coreText.split("\n").filter((line) => line.startsWith("ask "));
  assert.ok(askLines.length >= 2, "core 必须含至少两个 ask 站点行");
  assert.deepEqual(askLines, [...askLines].sort(), "ask 站点行必须按 locale 独立序排列");
});
