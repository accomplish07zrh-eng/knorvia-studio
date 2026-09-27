// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS,
  type ListModelsOutput,
  type ListSavedWorkflowsOutput,
  type ListWorkflowRunsOutput,
  type ResumeWorkflowRunOutput,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { CardBudget } from "./policy.js";

export function runsCard(data: ListWorkflowRunsOutput): ToolResultDisplayPayload {
  return {
    kind: "list_workflow_runs",
    runs: data.runs,
    ...(data.truncated === true ? { truncated: true } : {}),
  };
}

export function resumeCard(data: ResumeWorkflowRunOutput): ToolResultDisplayPayload {
  return { kind: "resume_workflow_run", runId: data.runId };
}

export function savedCard(data: ListSavedWorkflowsOutput): ToolResultDisplayPayload {
  const budget = new CardBudget();
  const metadata = (value: string | undefined) =>
    budget.optionalText(value, WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS);
  const workflows = data.workflows.map((entry) => {
    return {
      name: entry.name,
      description: metadata(entry.description),
      whenToUse: metadata(entry.whenToUse),
      scope: entry.scope,
      path: entry.path,
      argNames: entry.args === undefined ? [] : Object.keys(entry.args),
    };
  });
  const invalid = data.invalid?.map((entry) => ({
    path: entry.path,
    reason: metadata(entry.reason),
  }));
  // 保留现有构造/回放 schema 间的限制差异；这次替换不偷偷裁掉列表或参数名。
  return {
    kind: "saved_workflow_list",
    workflows,
    ...(invalid?.length ? { invalid } : {}),
    ...budget.flag,
  };
}

export function modelsCard(data: ListModelsOutput): ToolResultDisplayPayload {
  const budget = new CardBudget();
  const rows = budget.window(data.models, WORKFLOW_OBSERVATION_DISPLAY_MAX_MODELS);
  const models = rows.map((model) => {
    const providerLabel = budget.optionalText(
      model.providerLabel,
      WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS,
    );
    const disabledReason = budget.optionalText(
      model.disabledReason,
      WORKFLOW_OBSERVATION_DISPLAY_MAX_META_CHARS,
    );
    return {
      id: model.id,
      providerId: model.providerId,
      modelId: model.modelId,
      ...(providerLabel === undefined ? {} : { providerLabel }),
      reasoningLevels: Array.from(model.reasoningLevels),
      ...(model.defaultReasoningLevel === undefined
        ? {}
        : { defaultReasoningLevel: model.defaultReasoningLevel }),
      ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
      ...(disabledReason === undefined ? {} : { disabledReason }),
    };
  });
  return {
    kind: "list_models",
    ...(data.current === undefined ? {} : { current: data.current }),
    models,
    ...budget.flag,
  };
}
