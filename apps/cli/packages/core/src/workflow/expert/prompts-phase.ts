// SPDX-License-Identifier: Apache-2.0
// 相位提示词的段落渲染器：头、策略、目标、图种子契约与收尾；顺序即提示词契约。
import { PROMPT_TEXTS } from "./prompts.text.js";
import { artifactSection, BLANK, bullet, NL, type Renderer } from "./prompts-sections.js";

/** 策略段：四行数值全部取自快照策略，标签与顺序不可重排。 */
const strategySection: Renderer = ({ run }) => {
  const { clarify, executor, finalCritic, reactLoop } = run.strategy;
  return [
    PROMPT_TEXTS.strategyHeading,
    bullet(
      "Clarify max rounds",
      `${clarify.maxRounds}, min rounds: ${clarify.minRounds}, confidence threshold: ${clarify.confidenceThreshold}`,
    ),
    bullet(
      "Executor frontier target",
      `${executor.frontierTarget}, max concurrent loops: ${executor.maxConcurrentLoops}, max planner runs: ${executor.maxPlannerRuns}`,
    ),
    bullet("React loop max rounds", reactLoop.maxRounds),
    bullet("Final critic max iterations", finalCritic.maxIterations),
  ];
};

/** 图种子契约段：仅当相位声明 seedGraphFromArtifact 时出现，targetPhase 决定示例中的目标阶段。 */
const seedContractSection: Renderer = ({ phaseDefinition }) => {
  const seed = phaseDefinition.seedGraphFromArtifact;
  if (seed === undefined) return [];
  return [
    BLANK,
    PROMPT_TEXTS.graphHeading,
    `Return a JSON object, either raw or fenced as \`\`\`json, so the workflow runtime can seed the ${seed.targetPhase} DAG:`,
    PROMPT_TEXTS.graphExample,
    PROMPT_TEXTS.graphRules,
  ];
};

/** 相位头：身份、运行号、工作目录与用户任务原文（任务整段嵌入，不做转义）。 */
const phaseHeaderSection: Renderer = ({ phaseDefinition, run }) => [
  `You are running the Knorvia Studio workflow phase: ${phaseDefinition.phase}.`,
  `Workflow run: ${run.runId}`,
  `Working directory: ${run.cwd}`,
  BLANK,
  `User task:${NL}${run.task}`,
  BLANK,
];

/** 相位目标段：说明文本来自工作流定义，这里只负责与前后空行拼接。 */
const phaseObjectiveSection: Renderer = ({ phaseDefinition }) => [
  BLANK,
  `Phase objective:${NL}${phaseDefinition.description}`,
  BLANK,
];

/** 相位收尾：要求产出可复核的 Markdown 工件（路径、命令、风险、后续动作）。 */
const phaseFooterSection: Renderer = () => [BLANK, PROMPT_TEXTS.phaseOutput];

/** 相位提示词段落顺序（契约）：头 → 策略 → 目标 → 工件 → 图种子契约 → 收尾。 */
export const PHASE_SECTIONS: readonly Renderer[] = [
  phaseHeaderSection,
  strategySection,
  phaseObjectiveSection,
  artifactSection,
  seedContractSection,
  phaseFooterSection,
];
