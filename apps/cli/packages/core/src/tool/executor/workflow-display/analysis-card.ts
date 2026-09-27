// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS,
  WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS,
  type CreateWorkflowOutput,
  type EvalWorkflowSnippetOutput,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { CardBudget, diagnosticRows } from "./policy.js";

export function analysisCard(data: CreateWorkflowOutput): ToolResultDisplayPayload {
  const budget = new CardBudget();
  const errorCount = data.diagnostics.length;
  const diagnostics = diagnosticRows(data.diagnostics, budget);
  return {
    kind: "create_workflow",
    ok: data.ok,
    errorCount,
    diagnostics,
    ...(data.causalityGraph === undefined ? {} : { causalityGraph: data.causalityGraph }),
    ...budget.flag,
  };
}

export function snippetCard(data: EvalWorkflowSnippetOutput): ToolResultDisplayPayload {
  const budget = new CardBudget();
  const diagnostics = diagnosticRows(data.diagnostics, budget);
  const recent = budget.window(data.logs, WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_ENTRIES, "tail");
  const logs = recent.map((entry) =>
    budget.text(entry, WORKFLOW_OBSERVATION_DISPLAY_MAX_LOG_CHARS),
  );
  const response = budget.text(data.response, WORKFLOW_OBSERVATION_DISPLAY_MAX_RESULT_CHARS);
  return {
    kind: "eval_workflow_snippet",
    ok: data.ok,
    diagnostics,
    logs,
    response,
    durationMs: data.durationMs,
    ...budget.flag,
  };
}
