// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  EVAL_WORKFLOW_SNIPPET_TOOL_NAME,
  EvalWorkflowSnippetOutputSchema,
  GET_WORKFLOW_RUN_TOOL_NAME,
  GetWorkflowRunOutputSchema,
  LIST_MODELS_TOOL_NAME,
  ListModelsOutputSchema,
  LIST_SAVED_WORKFLOWS_TOOL_NAME,
  ListSavedWorkflowsOutputSchema,
  LIST_WORKFLOW_RUNS_TOOL_NAME,
  ListWorkflowRunsOutputSchema,
  RESUME_WORKFLOW_RUN_TOOL_NAME,
  ResumeWorkflowRunOutputSchema,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { snippetCard } from "./workflow-display/analysis-card.js";
import { modelsCard, runsCard, savedCard, resumeCard } from "./workflow-display/catalog-cards.js";
import { fromSnapshot, type WorkflowProjector } from "./workflow-display/policy.js";
import { runCard } from "./workflow-display/run-card.js";

const projectors: ReadonlyMap<string, WorkflowProjector> = new Map([
  [GET_WORKFLOW_RUN_TOOL_NAME, fromSnapshot(GetWorkflowRunOutputSchema, runCard)],
  [LIST_WORKFLOW_RUNS_TOOL_NAME, fromSnapshot(ListWorkflowRunsOutputSchema, runsCard)],
  [EVAL_WORKFLOW_SNIPPET_TOOL_NAME, fromSnapshot(EvalWorkflowSnippetOutputSchema, snippetCard)],
  [LIST_SAVED_WORKFLOWS_TOOL_NAME, fromSnapshot(ListSavedWorkflowsOutputSchema, savedCard)],
  [LIST_MODELS_TOOL_NAME, fromSnapshot(ListModelsOutputSchema, modelsCard)],
  [RESUME_WORKFLOW_RUN_TOOL_NAME, fromSnapshot(ResumeWorkflowRunOutputSchema, resumeCard)],
]);

export function createWorkflowObservationDisplay(
  toolName: string,
  output: unknown,
): ToolResultDisplayPayload | undefined {
  return projectors.get(toolName)?.(output);
}
