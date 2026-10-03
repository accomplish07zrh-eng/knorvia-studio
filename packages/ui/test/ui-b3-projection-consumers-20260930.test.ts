// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { KNORVIA_AGENT_PROVIDER, type KnorviaConfigOption } from "@knorvia/shared";
import { projectSessionConfigToTaskConfigOptions } from "../src/v4/composer/sessionConfigTaskCache.js";
import {
  workflowRunSettingsModelOf,
  workflowRunSettingsModelCanonical,
} from "../src/components/workflow-timeline/workflowRunSettings.js";
import { describeWorkflowSubagentModel } from "../src/components/workflow-timeline/subagent-model-label.js";
import { prepareWorkspaceWithKnorviaSessionService } from "../src/hooks/workspacePrepareRpc.js";
import { deepFreeze, projectionUrl, settings } from "./ui-b3-projection-fixtures-20260930.js";

const { sessionSettingsToConfigOptions: config } = await import(projectionUrl());

test("B3 consumer: authoritative session config overlays real projected catalog without copying choices", () => {
  const source = settings();
  source.thoughtLevel = {
    enabled: true,
    available: [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
    defaultLevel: "low",
  };
  const catalog: KnorviaConfigOption[] = config(deepFreeze(source));
  const model = catalog[0]!;
  model.options!.push({ value: "custom:p%2Fid:a%3Afree", name: "Saved custom model" });
  const result = projectSessionConfigToTaskConfigOptions(deepFreeze(catalog), {
    provider: " p/id ",
    model: " p/id/a:free ",
    mode: " yolo ",
    thought: " high ",
  });
  assert.deepEqual(
    result.map((option) => option.currentValue),
    ["custom:p%2Fid:a%3Afree", "yolo", "high"],
  );
  assert.notEqual(result[0], model);
  assert.equal(result[0]!.options, model.options);
  assert.equal(model.currentValue, "provider/default");
  const noModel = projectSessionConfigToTaskConfigOptions(catalog, {
    provider: "",
    model: "",
    mode: "",
    thought: "",
  });
  assert.equal(noModel[0], model);
  assert.equal(noModel[1], catalog[1]);
  assert.equal(noModel[2]!.currentValue, "");
});

test("B3 consumer: workflow settings preserve normal/custom model parsing and rejected fallback", () => {
  assert.deepEqual(workflowRunSettingsModelOf(" provider/a:free$high "), {
    kind: "model",
    providerId: "provider",
    modelId: "a:free",
    level: "high",
  });
  assert.equal(
    workflowRunSettingsModelCanonical({
      kind: "model",
      providerId: "provider",
      modelId: "a:free",
      level: "high",
    }),
    "provider/a:free$high",
  );
  assert.deepEqual(workflowRunSettingsModelOf("custom:p%2Fid:a%3Afree"), {
    kind: "model",
    providerId: "p/id",
    modelId: "a:free",
  });
  assert.deepEqual(workflowRunSettingsModelOf("broken"), {
    kind: "model",
    providerId: "",
    modelId: "broken",
  });
  assert.deepEqual(workflowRunSettingsModelOf(undefined), { kind: "session" });
  const label = describeWorkflowSubagentModel("custom:p%2Fid:a%3Afree", {
    formatMessage: ({ id }) => id,
    providerName: (provider) => (provider === "p/id" ? "Named provider" : undefined),
  });
  assert.deepEqual(label, { canonical: "custom:p%2Fid:a%3Afree", name: "Named provider/a:free" });
});

test("B3 consumer: real workspace prepare keeps read protocol, raw paths and slash-command identity", async (t) => {
  const globals = globalThis as typeof globalThis & {
    __KNORVIA_RENDERER_DISABLE_LOGGING__?: boolean;
  };
  const previous = globals.__KNORVIA_RENDERER_DISABLE_LOGGING__;
  globals.__KNORVIA_RENDERER_DISABLE_LOGGING__ = true;
  t.after(() => {
    globals.__KNORVIA_RENDERER_DISABLE_LOGGING__ = previous;
  });
  const calls: unknown[] = [];
  const slashCommands = [{ name: "fixture", description: "Fixture command" }];
  const provider = KNORVIA_AGENT_PROVIDER;
  const result = await prepareWorkspaceWithKnorviaSessionService({
    workspacePath: String.raw`C:\fixture\a%20b`,
    workspaceIdentity: "remote:exact",
    provider,
    sessionService: {
      readWorkspacePresentation: async (request) => {
        calls.push(request);
        return {
          workspace: { workspacePath: request.workspacePath, workspaceKey: "fixture-key" },
          mode: "auto",
          slashCommands,
        };
      },
    },
  });
  assert.deepEqual(calls, [
    { workspacePath: String.raw`C:\fixture\a%20b`, workspaceIdentity: "remote:exact" },
  ]);
  assert.equal(result.workspacePath, String.raw`C:\fixture\a%20b`);
  assert.equal(result.version, "Knorvia Studio Protocol/1");
  assert.equal(result.preparedSessionId, "");
  assert.equal(result.provider, provider);
  assert.equal(result.slashCommands, slashCommands);
  assert.equal(result.configOptions![0]!.currentValue, "build");
  const failure = new Error("read presentation failure");
  await assert.rejects(
    prepareWorkspaceWithKnorviaSessionService({
      workspacePath: "/synthetic",
      provider,
      sessionService: {
        readWorkspacePresentation: async () => {
          throw failure;
        },
      },
    }),
    (error) => error === failure,
  );
});
