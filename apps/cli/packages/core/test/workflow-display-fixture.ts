// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { GetWorkflowRunOutput, ListWorkflowRunsRun } from "@knorvia/contracts";
export const diagnostic = (message = "problem") => ({ line: 1, column: 2, code: 3, message });
export const graph = { steps: [], lanes: [], participants: [], handoffs: [], truncated: true };
export const runRow = (runId = "run"): ListWorkflowRunsRun => ({
  runId,
  label: "fixture",
  labelSource: "name",
  status: "running",
  ownedByThisSession: true,
  createdAt: 1,
  updatedAt: 2,
  spentTokens: 3,
});
export const runSnapshot = (
  overrides: Partial<GetWorkflowRunOutput> = {},
): GetWorkflowRunOutput => {
  const { spentTokens, ...summary } = runRow();
  return {
    ...summary,
    summary: "running",
    generatedAt: 10,
    usage: { spentTokens, nodesObserved: 1, nodesRunning: 1, nodesCompleted: 0, nodesFailed: 0 },
    actors: [],
    logTail: [],
    subagents: [],
    health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: false },
    ...overrides,
  };
};
export const savedRow = {
  name: "sample",
  description: "description",
  scope: "project" as const,
  path: "sample.dwf.ts",
};
export const modelRow = {
  id: "p/m",
  providerId: "p",
  modelId: "m",
  reasoningLevels: ["low", "high"],
};
