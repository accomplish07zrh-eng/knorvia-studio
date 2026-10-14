// SPDX-License-Identifier: Apache-2.0
// core-03 契约测试：导出面与模块边界（B15/B16/B18/B19）。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { core, entryLabel, repoRoot } from "./entry.mjs";

const requiredExpertValues = [
  "BUILT_IN_EXPERT_WORKFLOW_KIND",
  "BUILT_IN_EXPERT_WORKFLOW_DEFINITION_ID",
  "BUILT_IN_EXPERT_WORKFLOW_DEFINITION_VERSION",
  "DEFAULT_EXPERT_WORKFLOW_STRATEGY",
  "createExpertWorkflowDefinition",
  "ExpertWorkflowRuntime",
  "WorkflowRuntime",
  "formatExpertWorkflowStatus",
];

const requiredSchedulerValues = [
  "WorkflowGraphScheduler",
  "reconcileWorkflowSnapshotForResume",
  "deriveWorkflowRunSchedulerState",
  "deriveWorkflowSchedulerState",
];

test("B18 包根可加载且导出数达到约定规模", () => {
  const names = Object.keys(core);
  assert.ok(
    names.length >= 150,
    `expected >=150 named exports, got ${names.length} (${entryLabel})`,
  );
  for (const name of [...requiredExpertValues, ...requiredSchedulerValues]) {
    assert.ok(name in core, `missing value export: ${name} (${entryLabel})`);
  }
});

test("B19 interface.md 列出的模块路径都存在", () => {
  const interfacePath = resolve(repoRoot, "specs/contracts/core-03/interface.md");
  assert.ok(existsSync(interfacePath), "interface.md missing");
  const rows = readFileSync(interfacePath, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("| `"));
  assert.ok(rows.length >= 35, `expected >=35 module rows, got ${rows.length}`);
  let checked = 0;
  for (const row of rows) {
    const match = row.match(/^\| `([^`]+)`/u);
    if (!match) continue;
    const abs = resolve(repoRoot, "apps/cli/packages/core", match[1]);
    assert.ok(existsSync(abs), `module path from interface.md missing: ${match[1]}`);
    checked += 1;
  }
  assert.ok(checked >= 35, `checked ${checked} module paths`);
});

test("B15 内置专家工作流定义常量稳定", () => {
  assert.equal(typeof core.createExpertWorkflowDefinition, "function");
  const definition = core.createExpertWorkflowDefinition({});
  assert.ok(definition && typeof definition === "object", "definition should be an object");
  const strategy = core.DEFAULT_EXPERT_WORKFLOW_STRATEGY;
  assert.ok(strategy && typeof strategy === "object", "strategy should be an object");
});

test("B16 状态派生来自 contracts 且行为一致", async () => {
  const contractsEntry = pathToFileURL(
    resolve(repoRoot, "apps/cli/packages/contracts/dist/index.js"),
  ).href;
  const contracts = await import(contractsEntry);
  assert.equal(core.deriveWorkflowRunSchedulerState, contracts.deriveWorkflowRunSchedulerState);
  assert.equal(core.deriveWorkflowSchedulerState, contracts.deriveWorkflowSchedulerState);
});
