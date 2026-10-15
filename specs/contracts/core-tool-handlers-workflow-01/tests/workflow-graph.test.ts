// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-workflow-01 contract tests: analysis memo, bounded display graph projection and
// phase-edge folding. Inputs are synthetic analyzer graphs (typed as never) so the assertions pin the
// projection's bounding rules rather than the analyzer's output.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundGraphOfAnalysis,
  displayOfAnalysis,
} from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-analysis-display.js";
import { boundCausalityGraph } from "../../../../apps/cli/packages/core/src/tool/handlers/create-workflow-graph-bounds.js";
import { foldPhaseEdges } from "../../../../apps/cli/packages/core/src/tool/handlers/create-workflow-graph-fold.js";
import { analyzeScript } from "../../../../apps/cli/packages/core/src/tool/handlers/workflow-script-analysis.js";

const CLEAN_SCRIPT = 'phase("研究")\nreturn 1;\n';
const BAD_SCRIPT = 'const x: number = "nope";\nreturn x;\n';

type Step = {
  id: string;
  kind: string;
  label?: string;
  labelPattern?: { head?: string; tail?: string };
  loc: { line: number; column: number };
  lane: string;
  lanes?: string[];
  source?: string;
  phase?: string;
  repeat?: number;
};

function step(id: string, lane: string, extra: Partial<Step> = {}): Step {
  return { id, kind: "run", label: `label-${id}`, loc: { line: 1, column: 1 }, lane, ...extra };
}

test("B-an-1 分析单槽记忆：紧邻重复命中同一结果，换文重算", () => {
  const first = analyzeScript(CLEAN_SCRIPT);
  const again = analyzeScript(CLEAN_SCRIPT);
  assert.equal(again, first, "同一段脚本紧邻两次取到同一个结果对象");

  const other = analyzeScript(BAD_SCRIPT);
  assert.notEqual(other, first);

  const third = analyzeScript(CLEAN_SCRIPT);
  assert.notEqual(third, first, "单槽只保留最近一次：换文之后再回来要重算");
  assert.deepEqual(third.diagnostics, first.diagnostics);
  assert.equal(third.ok, first.ok);
});

test("B-an-2 分析投影两态：无因果图缺席，有则有界", () => {
  assert.equal(boundGraphOfAnalysis(analyzeScript(BAD_SCRIPT)), undefined);
  const bounded = boundGraphOfAnalysis(analyzeScript(CLEAN_SCRIPT));
  assert.notEqual(bounded, undefined);
  assert.deepEqual(bounded?.steps, []);
  assert.deepEqual(bounded?.lanes, []);
  assert.deepEqual(bounded?.participants, []);
  assert.deepEqual(bounded?.handoffs, []);
  assert.deepEqual(bounded?.phases, [{ id: "phase#1", name: "研究", line: 1, column: 1 }]);
  assert.deepEqual(bounded?.exits, ["phase#1"]);
});

test("B-an-3 display 投影只有一份 kind，工具名只是入参", () => {
  const analysis = analyzeScript(CLEAN_SCRIPT);
  const display = displayOfAnalysis(analysis);
  assert.equal(display?.kind, "create_workflow");
  assert.equal(display?.ok, true);
  assert.equal(display?.errorCount, 0);
  assert.deepEqual(display?.diagnostics, []);
  assert.deepEqual(display?.causalityGraph?.phases, [
    { id: "phase#1", name: "研究", line: 1, column: 1 },
  ]);
  const amend = displayOfAnalysis(analysis, "AmendWorkflow");
  assert.equal(amend?.kind, "create_workflow");
});

test("B-an-4 裁剪顺序固定：step 先截、lane 按引用收敛，引用完整性优先", () => {
  const steps: Step[] = [];
  for (let i = 0; i < 70; i += 1) steps.push(step(`step-${i}`, "lane-a"));
  const graph = {
    steps,
    lanes: [
      { id: "lane-a", name: "A" },
      { id: "lane-orphan", name: "never referenced" },
    ],
    sink: { fedBy: ["step-1", "step-999"] },
  };
  const bounded = boundCausalityGraph(graph as never);
  assert.equal(bounded.steps.length, 64, "step 表截到 64");
  assert.equal(bounded.truncated, true);
  assert.deepEqual(
    bounded.lanes.map((lane) => lane.id),
    ["lane-a"],
    "没有存活 step 引用的 lane 不画",
  );
  assert.deepEqual(bounded.sink, ["step-1"], "sink 只留存活 step");
  assert.equal(bounded.phases, undefined, "没有阶段表就不带阶段层");
});

test("B-an-5 lane 收敛连带裁掉引用它的 step 与卡片", () => {
  const graph = {
    steps: [step("step-1", "lane-a"), step("step-2", "lane-b")],
    lanes: [{ id: "lane-a" }],
    sink: { fedBy: [] },
  };
  const handoff = {
    participants: [
      { id: "card-1", phase: "phase#1", lane: "lane-a", steps: ["step-1"] },
      { id: "card-2", phase: "phase#1", lane: "lane-b", steps: ["step-2"] },
    ],
    handoffs: [
      { from: "card-1", to: "card-2", types: ["note"] },
      { from: "card-1", to: "card-1" },
    ],
  };
  const bounded = boundCausalityGraph(graph as never, undefined, handoff as never);
  assert.deepEqual(
    bounded.steps.map((s) => s.id),
    ["step-1"],
    "lane-b 不在 lane 表里：引用它的 step 被裁",
  );
  assert.deepEqual(
    bounded.participants.map((p) => p.id),
    ["card-1"],
    "没有存活成员的卡片不画",
  );
  // 端点过滤只看卡片是否存活：card-1 自环两端都在场，照画；指向被裁卡片的边不画。
  assert.deepEqual(bounded.handoffs, [{ from: "card-1", to: "card-1" }]);
});

test("B-an-6 文本限长对代理对安全：截断不落半个字符", () => {
  const label = `${"x".repeat(127)}\u{1F600}`;
  const graph = {
    steps: [step("step-1", "lane-a", { label })],
    lanes: [{ id: "lane-a" }],
  };
  const bounded = boundCausalityGraph(graph as never);
  const projected = bounded.steps[0]!;
  assert.equal(projected.label.length, 127);
  assert.equal(/[\uD800-\uDBFF]$/u.test(projected.label), false, "结尾不留孤立高位代理");
  assert.equal(projected.label, "x".repeat(127));
});

test("B-an-7 阶段层：同名跨环折叠在语义层，alongside 去重去自身", () => {
  const graph = {
    steps: [
      step("step-1", "lane-a", { phase: "phase#1" }),
      step("step-2", "lane-a", { phase: "phase#9" }),
    ],
    lanes: [{ id: "lane-a" }],
    sink: { fedBy: [] },
  };
  const flow = {
    phases: [
      {
        id: "phase#1",
        name: "研究",
        loc: { line: 1, column: 1 },
        alongside: ["phase#2", "phase#1", "phase#2", "phase#missing"],
      },
      { id: "phase#2", name: "并行" },
    ],
    phaseEdges: [
      { from: "entry", kind: "next", to: "phase#1" },
      { from: "phase#1", kind: "next", to: "phase#2" },
      { from: "phase#2", kind: "jump", to: "sink" },
    ],
  };
  const bounded = boundCausalityGraph(graph as never, flow as never, undefined);
  assert.deepEqual(bounded.phases, [
    { id: "phase#1", name: "研究", line: 1, column: 1, alongside: ["phase#2"] },
    { id: "phase#2", name: "并行" },
  ]);
  assert.deepEqual(bounded.phaseEdges, [{ from: "phase#1", to: "phase#2" }]);
  assert.deepEqual(bounded.exits, ["phase#2"]);
  // step.phase 不在阶段词汇表：该键不发。
  assert.deepEqual(
    bounded.steps.map((s) => s.phase),
    ["phase#1", undefined],
  );
  assert.equal("phase" in bounded.steps[1]!, false);
});

test("B-an-8 阶段层超限时整层缺席并计入截断标记", () => {
  const graph = {
    steps: [step("step-1", "lane-a", { phase: "phase#1" })],
    lanes: [{ id: "lane-a" }],
  };
  const phases = [];
  for (let i = 0; i < 40; i += 1) phases.push({ id: `phase#${i}`, name: `p${i}` });
  const bounded = boundCausalityGraph(
    graph as never,
    { phases, phaseEdges: [] } as never,
    undefined,
  );
  assert.equal(bounded.phases, undefined);
  assert.equal(bounded.truncated, true);
  assert.deepEqual(bounded.steps[0]?.phase, undefined);
  assert.equal(bounded.steps[0] && "phase" in bounded.steps[0], false);
});

test("B-an-9 未命名/未知阶段的卡片归到 unphased 一档", () => {
  const graph = {
    steps: [step("step-1", "lane-a", { phase: "phase#1" })],
    lanes: [{ id: "lane-a" }],
  };
  const handoff = {
    participants: [
      { id: "card-1", phase: "phase#1", lane: "lane-a", steps: ["step-1"] },
      { id: "card-2", phase: "phase#ghost", lane: "lane-a", steps: ["step-1"] },
    ],
    handoffs: [],
  };
  const flow = { phases: [{ id: "phase#1", name: "研究" }], phaseEdges: [] };
  const bounded = boundCausalityGraph(graph as never, flow as never, handoff as never);
  assert.equal(bounded.participants[0]?.phase, "phase#1");
  assert.equal(bounded.participants[1]?.phase, "unphased");
});

test("B-an-10 阶段边折叠：同对合取、自环丢弃、环上见证不成立", () => {
  // 传递边被归约删掉：a→c 由 a→b→c 见证。
  assert.deepEqual(
    foldPhaseEdges([
      { from: "a", to: "b", back: false },
      { from: "b", to: "c", back: false },
      { from: "a", to: "c", back: false },
    ]),
    [
      { from: "a", to: "b", back: false },
      { from: "b", to: "c", back: false },
    ],
  );
  // 同一有序对折叠成一条：back 是合取（存在前向事实就按前向）。
  assert.deepEqual(
    foldPhaseEdges([
      { from: "a", to: "b", back: true },
      { from: "a", to: "b", back: false },
    ]),
    [{ from: "a", to: "b", back: false }],
  );
  // 自环丢弃。
  assert.deepEqual(foldPhaseEdges([{ from: "a", to: "a", back: false }]), []);
  // 环内的边都留；穿过环的见证路径不成立，跨环的前向边仍归约。
  assert.deepEqual(
    foldPhaseEdges([
      { from: "a", to: "b", back: false },
      { from: "b", to: "a", back: true },
      { from: "a", to: "c", back: false },
      { from: "b", to: "c", back: false },
    ]),
    [
      { from: "a", to: "b", back: false },
      { from: "b", to: "a", back: true },
      { from: "b", to: "c", back: false },
    ],
  );
  // 与端点同环的节点构成的路径不断言可达：s→b 不被 s→a→(环) 蕴含删除以外的规则误删。
  assert.deepEqual(
    foldPhaseEdges([
      { from: "s", to: "a", back: false },
      { from: "a", to: "b", back: false },
      { from: "b", to: "a", back: true },
      { from: "s", to: "b", back: false },
    ]),
    [
      { from: "s", to: "a", back: false },
      { from: "a", to: "b", back: false },
      { from: "b", to: "a", back: true },
    ],
  );
});
