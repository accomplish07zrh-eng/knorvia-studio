// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  AMEND_WORKFLOW_TOOL_NAME,
  CREATE_WORKFLOW_TOOL_NAME,
  CreateWorkflowOutputSchema,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { analysisCard } from "./workflow-display/analysis-card.js";
import { fromSnapshot } from "./workflow-display/policy.js";
const names = new Set<string>([CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME]);
const project = fromSnapshot(CreateWorkflowOutputSchema, analysisCard);

export function createCreateWorkflowDisplay(
  toolName: string,
  output: unknown,
): ToolResultDisplayPayload | undefined {
  return names.has(toolName) ? project(output) : undefined;
}
