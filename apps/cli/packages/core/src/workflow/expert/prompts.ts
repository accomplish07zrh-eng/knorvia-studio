// SPDX-License-Identifier: Apache-2.0
// 提示词与报告的公开入口：段落渲染器按语义拆在 prompts-*.ts，本文件只做组装与导出，
// 公开路径与导出名保持不变。
import type { WorkflowGraphNode } from "@knorvia/contracts";
import { nodePromptLines } from "./prompts-node.js";
import { PHASE_SECTIONS } from "./prompts-phase.js";
import {
  joinSections,
  type PhaseDef,
  type RenderContext,
  type Run,
  type Text,
} from "./prompts-sections.js";

export { createPhaseGraph, updateGraphNodeStatus } from "./prompts-graph.js";
export { buildReport } from "./prompts-report.js";
export { buildScheduledPhaseSummary } from "./prompts-summary.js";

export function buildPhasePrompt(run: Run, phaseDefinition: PhaseDef): Text {
  return joinSections(PHASE_SECTIONS, { phaseDefinition, run });
}

export function buildScheduledNodePrompt(
  run: Run,
  phaseDefinition: PhaseDef,
  graphNode: WorkflowGraphNode,
): Text {
  const isPhaseNode = graphNode.phase === phaseDefinition.phase && graphNode.kind === "phase";
  if (isPhaseNode) return buildPhasePrompt(run, phaseDefinition);
  const context: RenderContext = { graphNode, phaseDefinition, run };
  return nodePromptLines(context);
}
