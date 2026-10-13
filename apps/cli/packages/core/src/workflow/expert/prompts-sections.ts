// SPDX-License-Identifier: Apache-2.0
// 提示词渲染的公共构件：渲染上下文、段落渲染器类型，以及列表项与工件段这两处共用渲染。
import type {
  ExpertWorkflowRunSnapshot,
  WorkflowGraphNode,
  WorkflowPhaseDefinition,
} from "@knorvia/contracts";
import { PROMPT_TEXTS } from "./prompts.text.js";

export type Run = ExpertWorkflowRunSnapshot;
export type PhaseDef = WorkflowPhaseDefinition;
export type Text = string;
export type Lines = readonly string[];

export const NL = "\n";
export const BLANK = "";
export const DASH = "- ";

/** 渲染上下文：段落渲染器共享的只读输入；节点字段只在节点渲染器里出现。 */
export interface RenderContext {
  phaseDefinition: PhaseDef;
  run: Run;
  graphNode?: WorkflowGraphNode;
  phaseName?: string;
}

export type Renderer = (context: RenderContext) => Lines;

/** 列表项统一渲染成「- 标签: 值」，保证相位、节点与汇总各处格式一致。 */
export const bullet = (label: string, value: string | number): Text => `${DASH}${label}: ${value}`;

/** 工件段：列出已落盘工件；没有工件时给固定说明句，避免模型臆造文件。 */
export const artifactSection: Renderer = ({ run }) => {
  const rows = run.artifacts.map((entry) => `${DASH}${entry.label}: ${entry.path}`);
  if (rows.length === 0) return [PROMPT_TEXTS.noArtifacts];
  return [PROMPT_TEXTS.artifactsHeading, ...rows];
};

/** 按段落渲染器表组装文本：顺序即段落顺序。 */
export const joinSections = (sections: readonly Renderer[], context: RenderContext): Text =>
  sections.flatMap((render) => render(context)).join(NL);
