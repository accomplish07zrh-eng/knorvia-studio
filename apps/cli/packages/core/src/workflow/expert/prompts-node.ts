// SPDX-License-Identifier: Apache-2.0
// 节点提示词的段落：头、身份、约束与收尾；作用域限定在单个节点。
import type { WorkflowGraphNode } from "@knorvia/contracts";
import { PROMPT_TEXTS } from "./prompts.text.js";
import {
  artifactSection,
  BLANK,
  bullet,
  NL,
  joinSections,
  type RenderContext,
  type Renderer,
  type Text,
} from "./prompts-sections.js";

/** 节点头：与相位提示词头同构，措辞指向单个节点。 */
const header: Renderer = ({ phaseDefinition, run }) => [
  `You are running a Knorvia Studio workflow node inside phase: ${phaseDefinition.phase}.`,
  `Workflow run: ${run.runId}`,
  `Working directory: ${run.cwd}`,
  BLANK,
  `User task:${NL}${run.task}`,
  BLANK,
];

/** 身份字段表：标签与节点字段一一对应，顺序即渲染顺序。 */
const IDENTITY_FIELDS: readonly (readonly [keyof WorkflowGraphNode, string])[] = [
  ["title", "Node"],
  ["id", "Node id"],
];

/** 可选补充段：目标与节点提示词，缺省时整段省略。 */
const OPTIONAL_FIELDS: readonly (readonly [keyof WorkflowGraphNode, string])[] = [
  ["description", "Node objective"],
  ["prompt", "Node prompt"],
];

/** 身份行：标题与 id 必出现；目标与提示词在存在时以「标签 + 换行 + 原文」追加。 */
const identityLines = (node: WorkflowGraphNode | undefined): string[] => {
  if (node === undefined) return [];
  const rows = IDENTITY_FIELDS.map(([field, label]) => `${label}: ${node[field]}`);
  for (const [field, label] of OPTIONAL_FIELDS) {
    const value = node[field];
    if (typeof value === "string" && value.length > 0) rows.push(`${label}:${NL}${value}`);
  }
  return rows;
};
/** 约束段：只列与单节点执行相关的两条上限（并发与 ReAct 轮数）。 */
const constraints: Renderer = ({ run }) => [
  PROMPT_TEXTS.constraintsHeading,
  bullet("Max concurrent loops", run.strategy.executor.maxConcurrentLoops),
  bullet("React loop max rounds", run.strategy.reactLoop.maxRounds),
];

/** 空行段：在段落序列里表达固定空行。 */
const blank: Renderer = () => [BLANK];

/** 收尾：限定作用域，避免节点越界执行其它节点的任务。 */
const footer: Renderer = () => [BLANK, PROMPT_TEXTS.nodeOutput];

/** 节点提示词：按契约顺序拼段落；身份段为空时自动省略其内容。 */
export const nodePromptLines = (context: RenderContext): Text => {
  const identity: Renderer = ({ graphNode }) => identityLines(graphNode);
  const opening = [header, identity, blank];
  const closing = [constraints, blank, artifactSection, footer];
  return joinSections([...opening, ...closing], context);
};
