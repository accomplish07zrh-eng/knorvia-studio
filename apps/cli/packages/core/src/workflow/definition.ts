// SPDX-License-Identifier: Apache-2.0
// 内置「专家工作流」定义：常量与相位元数据表驱动。相位表把「顺序/标题/行为/说明」放在同一条
// 记录里，构造器只做查表与两处特化（图种子、节点提示词），工件路径单独成表。
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowPhaseDefinition,
  type WorkflowStrategy,
} from "@knorvia/contracts";

const WORKFLOW_KIND = "expert";
const DEFINITION_ID = "expert";
const DEFINITION_VERSION = "2";
const WORKFLOW_TITLE = "Expert Workflow";

export const BUILT_IN_EXPERT_WORKFLOW_KIND = WORKFLOW_KIND;
export const BUILT_IN_EXPERT_WORKFLOW_DEFINITION_ID = DEFINITION_ID;
export const BUILT_IN_EXPERT_WORKFLOW_DEFINITION_VERSION = DEFINITION_VERSION;

type PhaseBehavior = WorkflowPhaseDefinition["behavior"];
type PhaseSpec = readonly [
  phase: string,
  title: string,
  behavior: PhaseBehavior,
  description: string,
];

/** 相位元数据：顺序即数组顺序；说明文本会进入提示词，属用户可见契约。 */
const PHASE_SPECS: readonly PhaseSpec[] = [
  [
    "clarify",
    "Clarify",
    "agent",
    "Refine the user goal, assumptions, acceptance criteria, and unresolved questions. Ask only if blocking.",
  ],
  [
    "task_analysis",
    "Task Analysis",
    "agent",
    "Map the task to repo context, constraints, risks, likely files, validation, and failure paths.",
  ],
  [
    "arch_decompose",
    "Architecture Decompose",
    "agent",
    "Decompose the work into a dependency graph of implementation and verification nodes.",
  ],
  [
    "env_setup",
    "Environment Setup",
    "agent",
    "Check whether environment setup, dependencies, credentials, or local services are required.",
  ],
  [
    "meta_prompt",
    "Meta Prompt",
    "agent",
    "Create the execution instructions, constraints, and node prompts needed for downstream work.",
  ],
  [
    "exec",
    "Execute",
    "scheduled_graph",
    "Execute the planned work through the normal agent runtime. Preserve small steps and validation.",
  ],
  [
    "final_critic",
    "Final Critic",
    "critic",
    "Review results against acceptance criteria, identify regressions, missing tests, and residual risk.",
  ],
  ["complete", "Complete", "complete", "Write final report and mark the run completed."],
];

/** 各相位的产出工件；`complete` 不产出工件。 */
const PHASE_ARTIFACTS: ReadonlyMap<string, string> = new Map([
  ["clarify", "artifacts/01-clarify.md"],
  ["task_analysis", "artifacts/02-task-analysis.md"],
  ["arch_decompose", "artifacts/03-architecture-decompose.md"],
  ["env_setup", "artifacts/04-env-setup.md"],
  ["meta_prompt", "artifacts/05-meta-prompt.md"],
  ["exec", "artifacts/06-exec.md"],
  ["final_critic", "artifacts/07-final-critic.md"],
]);

/** 执行器上限表：键名即策略字段，数值即协议。 */
const EXECUTOR_LIMITS: readonly (readonly [string, number])[] = [
  ["drainingChangeHours", 1],
  ["frontierTarget", 3],
  ["maxConcurrentLoops", 2],
  ["maxConsecutiveErrors", 3],
  ["maxPlannerRuns", 10],
];

/** 默认策略：澄清轮次、执行器上限、终审与 ReAct 轮数。 */
const BUILT_IN_EXPERT_STRATEGY: WorkflowStrategy = {
  clarify: { confidenceThreshold: 0.8, maxRounds: 3, minRounds: 1 },
  executor: Object.fromEntries(EXECUTOR_LIMITS) as WorkflowStrategy["executor"],
  finalCritic: { maxIterations: 3 },
  reactLoop: { maxRounds: 30 },
};

/** 默认策略对外只暴露只读引用（导入方不得就地修改）。 */
export const DEFAULT_EXPERT_WORKFLOW_STRATEGY: WorkflowStrategy = BUILT_IN_EXPERT_STRATEGY;

/** 相位构造：查表 + 两处特化（arch_decompose 播种图，meta_prompt 生成节点提示词）。 */
function buildPhase([phase, title, behavior, description]: PhaseSpec): WorkflowPhaseDefinition {
  const artifactPath = PHASE_ARTIFACTS.get(phase);
  const entry: WorkflowPhaseDefinition = {
    behavior,
    description,
    phase,
    title,
    ...(artifactPath === undefined ? {} : { artifactPath }),
  };
  if (phase === "arch_decompose") {
    return {
      ...entry,
      seedGraphFromArtifact: { gateAfterPhase: "meta_prompt", targetPhase: "exec" },
    };
  }
  if (phase === "meta_prompt") {
    return { ...entry, nodePromptsFromArtifact: { targetPhase: "exec" } };
  }
  return entry;
}

export function createExpertWorkflowDefinition(): WorkflowDefinition {
  const definition = WorkflowDefinitionSchema.parse({
    definitionId: DEFINITION_ID,
    definitionVersion: DEFINITION_VERSION,
    description:
      "Durable long-task workflow for large NL->Code work. " +
      "Child agent sessions perform each phase.",
    kind: WORKFLOW_KIND,
    phaseOrder: PHASE_SPECS.map(([phase]) => phase),
    phases: PHASE_SPECS.map((spec) => buildPhase(spec)),
    strategy: BUILT_IN_EXPERT_STRATEGY,
    title: WORKFLOW_TITLE,
  });
  return definition;
}

export function workflowDefinitionPhaseMap(
  definition: WorkflowDefinition,
): Map<string, WorkflowDefinition["phases"][number]> {
  return new Map(definition.phases.map((entry) => [entry.phase, entry]));
}
