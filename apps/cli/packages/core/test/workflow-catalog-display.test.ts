// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { toolResultDisplayPayloadSchema } from "@knorvia/contracts";
import { createWorkflowObservationDisplay as display } from "../src/tool/executor/workflow-observation-display.js";
import { modelRow, runRow, savedRow } from "./workflow-display-fixture.js";

test("run list preserves upstream truncation and its existing post-projection row-limit gap", () => {
  for (const truncated of [undefined, false, true]) {
    const card = display("ListWorkflowRuns", { runs: [runRow()], truncated });
    assert.deepEqual(card, {
      kind: "list_workflow_runs",
      runs: [runRow()],
      ...(truncated ? { truncated: true } : {}),
    });
  }
  const large = display("ListWorkflowRuns", {
    runs: Array.from({ length: 51 }, (_, i) => runRow(String(i))),
  });
  assert.ok(
    large?.kind === "list_workflow_runs" &&
      large.runs.length === 51 &&
      large.truncated === undefined,
  );
  assert.equal(toolResultDisplayPayloadSchema.safeParse(large).success, false);
});

test("saved workflows preserve own undefined metadata and argument key order", () => {
  const args = Object.fromEntries(["second", "first"].map((name) => [name, { type: "string" }]));
  const result = display("ListSavedWorkflows", { workflows: [{ ...savedRow, args }], invalid: [] });
  assert.deepEqual(result, {
    kind: "saved_workflow_list",
    workflows: [
      {
        name: "sample",
        description: "description",
        whenToUse: undefined,
        scope: "project",
        path: "sample.dwf.ts",
        argNames: ["second", "first"],
      },
    ],
  });
  assert.ok(
    result?.kind === "saved_workflow_list" && Object.hasOwn(result.workflows[0], "whenToUse"),
  );
  assert.ok(toolResultDisplayPayloadSchema.safeParse(result).success);
});

test("saved metadata byte budgets and existing display-schema gaps remain explicit", () => {
  const large = display("ListSavedWorkflows", {
    workflows: [{ ...savedRow, description: "中".repeat(1000), whenToUse: "中".repeat(1000) }],
    invalid: [{ path: "invalid", reason: "x".repeat(1500) }],
  });
  assert.ok(large?.kind === "saved_workflow_list" && large.truncated);
  assert.ok(Buffer.byteLength(large.workflows[0].description!) <= 2048);
  assert.equal(large.invalid?.[0].reason?.length, 1500);
  assert.equal(toolResultDisplayPayloadSchema.safeParse(large).success, false);
  const args = Object.fromEntries(
    Array.from({ length: 33 }, (_, i) => [String(i), { type: "string" }]),
  );
  const excess = display("ListSavedWorkflows", {
    workflows: Array.from({ length: 51 }, () => ({ ...savedRow, args })),
  });
  assert.ok(
    excess?.kind === "saved_workflow_list" &&
      excess.workflows.length === 51 &&
      excess.workflows[0].argNames.length === 33 &&
      excess.truncated === undefined,
  );
  assert.equal(toolResultDisplayPayloadSchema.safeParse(excess).success, false);
});

test("model catalog uses a leading window without changing current selection or empty metadata", () => {
  const model = {
    ...modelRow,
    providerLabel: "",
    disabledReason: "",
    defaultReasoningLevel: "",
    contextWindow: 0,
  };
  const result = display("ListModels", {
    current: "p/last",
    models: [...Array.from({ length: 100 }, () => model), { ...model, id: "p/last" }],
  });
  assert.ok(result?.kind === "list_models" && result.truncated);
  assert.equal(result.current, "p/last");
  assert.equal(result.models.length, 100);
  assert.deepEqual(result.models[0], model);
  assert.notEqual(result.models[0].reasoningLevels, model.reasoningLevels);
  assert.ok(toolResultDisplayPayloadSchema.safeParse(result).success);
  const bounded = display("ListModels", {
    models: [{ ...modelRow, providerLabel: "中".repeat(1000), disabledReason: "中".repeat(1000) }],
  });
  assert.ok(
    bounded?.kind === "list_models" &&
      bounded.truncated &&
      Buffer.byteLength(bounded.models[0].providerLabel!) <= 2048 &&
      Buffer.byteLength(bounded.models[0].disabledReason!) <= 2048,
  );
  assert.equal(display("ListModels", { models: [{ ...model, extra: true }] }), undefined);
});
