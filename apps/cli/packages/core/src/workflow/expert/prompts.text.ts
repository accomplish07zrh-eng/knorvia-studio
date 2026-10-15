// SPDX-License-Identifier: Apache-2.0
// 专家工作流的提示词文案：整段文本即行为契约（逐字保留）。集中在本模块，主文件只保留渲染逻辑，
// 便于逐段复核文案、避免渲染代码与文案互相牵动。
export const PROMPT_TEXTS = Object.freeze({
  artifactsHeading: "Previous artifacts available on disk:",
  constraintsHeading: "Scheduling constraints:",
  graphExample:
    '{"nodes":[{"id":"implement_auth","title":"Implement auth","description":"small executable unit","dependsOn":["setup_config"],"collectionId":"implementation","prompt":"optional node-specific instructions"}],"edges":[{"from":"setup_config","to":"implement_auth"}],"collections":[{"collectionId":"implementation","title":"Implementation","nodeIds":["setup_config","implement_auth"],"explorable":false,"goal":"ship the feature","metric":"tests pass"}],"reasoning":"brief rationale"}',
  graphHeading: "Architecture graph contract:",
  graphRules:
    "Node ids must be unique, references must point to real node ids, " +
    "and edges must not create cycles.",
  noActivities: "- No activities.",
  noArtifacts: "No previous artifacts yet.",
  noScheduledNodes: "- No scheduled nodes.",
  nodeOutput:
    "Execute only this node's scope. Return a concise Markdown artifact with changes, validation, and residual risk.",
  phaseOutput:
    "Output a concise Markdown artifact for this phase. Preserve concrete file paths, commands, risks, " +
    "and next actions. If this phase executes code, make the edits and run focused validation when practical.",
  schedulerSummaryTitle: "Scheduler Summary",
  strategyHeading: "Scheduling strategy:",
} as const);

export type PromptTexts = typeof PROMPT_TEXTS;
