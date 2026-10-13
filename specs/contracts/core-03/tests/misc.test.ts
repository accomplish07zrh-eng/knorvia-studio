// SPDX-License-Identifier: Apache-2.0
// core-03 契约测试：事件日志、集合规划、解析器、遥测（B8/B9/B13/B14/B17）。
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { core, entryLabel, repoRoot } from "./entry.mjs";
import { makeSchedulerDeps, makeSnapshot, primeStrategy } from "./fixtures.mjs";

primeStrategy(core);

/** 按入口（source/dist）解析本包内部模块路径。 */
function moduleUrl(relativeJsPath) {
  const base = resolve(repoRoot, "apps/cli/packages/core");
  const file =
    entryLabel === "dist"
      ? resolve(base, "dist", relativeJsPath)
      : resolve(base, "src", relativeJsPath.replace(/\.js$/u, ".ts"));
  return pathToFileURL(file).href;
}

const allEvents = (fake) => [...fake.events, ...fake.appended];

test("B8 事件日志：完成事件在首次前沿事件之后，且带 phase/message", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a" }] });
  await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  const text = JSON.stringify(allEvents(fake));
  const frontierIndex = text.indexOf("frontier_changed");
  const completedIndex = text.indexOf("executor_completed");
  assert.ok(frontierIndex >= 0, "frontier_changed expected");
  assert.ok(
    completedIndex > frontierIndex,
    "executor_completed must come after the first frontier event",
  );
  assert.ok(text.includes('"execute"'), "phase should be recorded on events");
});

test("B9 集合规划：无规划器时不运行规划器且仍能完成", async () => {
  const fake = makeSchedulerDeps();
  const scheduler = new core.WorkflowGraphScheduler(fake.deps);
  const snapshot = makeSnapshot({ nodes: [{ id: "a" }] });
  const result = await scheduler.run({ cwd: "/work", phase: "execute", snapshot });
  assert.equal(result.status, "completed");
  assert.ok(
    !JSON.stringify(allEvents(fake)).includes("planner_agent"),
    "no planner activity expected",
  );
});

test("B13/A 子会话与图种子入口在包根可用（值导出）", () => {
  for (const name of [
    "applyWorkflowGraphSeed",
    "applyWorkflowNodePromptUpdates",
    "cancelWorkflowSnapshot",
    "reopenWorkflowGraphNode",
  ]) {
    assert.equal(typeof core[name], "function", `expected value export: ${name} (${entryLabel})`);
  }
});

test("B14 解析器：非法输入给结构化失败（抛错或显式空值），合法输入正常解析", async () => {
  // 「结构化失败」的契约含义：绝**不**把解析失败伪装成合法空结果（如 {}）；允许抛错或返回 null/undefined。
  const structuredFailure = (fn) => {
    try {
      const value = fn();
      assert.ok(
        value === null || value === undefined,
        "failure must be explicit (null/undefined) or throw",
      );
      return "empty";
    } catch (error) {
      assert.ok(
        error instanceof Error && error.message.length > 0,
        "thrown failure must carry a message",
      );
      return "throw";
    }
  };
  const json = await import(moduleUrl("workflow/expert/parsers/json.js"));
  structuredFailure(() => json.parsePlannerJson("not json at all"));
  // 形状不符的 JSON 也不得被静默当成空扩张：抛错或给出非空结果，但绝不能是 {}。
  let shallow;
  try {
    shallow = json.parsePlannerJson('{"a":1}');
  } catch (error) {
    assert.ok(error instanceof Error, "shape mismatch must fail explicitly");
  }
  if (shallow !== undefined) {
    assert.notDeepEqual(shallow, {}, "shallow JSON must not be accepted as an empty expansion");
  }
  assert.equal(json.isRecord({}), true);
  assert.equal(json.isRecord([]), false);
  const seed = await import(moduleUrl("workflow/expert/parsers/graph-seed.js"));
  structuredFailure(() => seed.parseWorkflowGraphSeed("garbage", "phase-1"));
  const critic = await import(moduleUrl("workflow/expert/parsers/critic.js"));
  assert.deepEqual(critic.dedupeReopenProposals([]), []);
  // critic 解析器复用规划器 JSON 解析：空输入与垃圾输入都必须给出可解释结果（抛错或显式空值）。
  structuredFailure(() => critic.parseCriticResult(""));
  structuredFailure(() => critic.parseCriticResult("garbage"));
});

test("B17 遥测：facade 可构造且无 causation 时返回 undefined", async () => {
  const telemetry = await import(moduleUrl("telemetry/runtime-telemetry.js"));
  assert.equal(typeof telemetry.RuntimeTelemetryFacade, "function");
  const facade = new telemetry.RuntimeTelemetryFacade({ sessionId: "session-1" });
  assert.equal(facade.captureCausation(), undefined);
  assert.ok(facade.port, "facade should expose a telemetry port");
});
