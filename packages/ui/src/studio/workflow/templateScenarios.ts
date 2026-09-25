import type { StudioOutputRef } from "@knorvia/services";
import { codeReviewScenario, releaseCheckScenario } from "./templateScenarioChecks.js";
import { contentPackScenario, documentCleanupScenario } from "./templateScenarioDelivery.js";
import type {
  ScenarioFixture,
  ScenarioLanguage,
  ScenarioText,
  TaskTemplate,
  TemplateScenario,
} from "./templateScenarioTypes.js";

/** 场景数据契约（T08）；见 `specs/knorvia-workflow-templates.md`。 */
export * from "./templateScenarioTypes.js";

/** 证据规则：每个 Agent 步骤都追加这一段，模型自述不构成证据。 */
export const EVIDENCE_RULE: ScenarioText = {
  zh: "证据规则：只把实际执行过的命令或工具调用及其原始输出当作证据；无法执行或无法复现的判断必须标注「未验证」；不得把推测、回忆、计划或模型自述当作已核实的结论。",
  en: "Evidence rule: only commands or tool calls actually run, with their raw output, count as evidence. Anything you could not run or reproduce must be marked unverified; never present guesses, recollection, plans, or your own claims as checked results.",
};

export const TEMPLATE_SCENARIOS: Record<TaskTemplate, TemplateScenario> = {
  releaseCheck: releaseCheckScenario,
  codeReview: codeReviewScenario,
  documentCleanup: documentCleanupScenario,
  contentPack: contentPackScenario,
};

/** 场景声明的全部输出名（去重，按声明顺序）。 */
export function scenarioOutputNames(scenario: TemplateScenario): string[] {
  const names: string[] = [];
  for (const step of scenario.steps)
    for (const name of step.outputNames ?? []) if (!names.includes(name)) names.push(name);
  return names;
}

/** 模板参数名（跨节点去重）；用于库页与对话框提示，不参与校验。 */
export function templateParameterNames(template: TaskTemplate): string[] {
  const names: string[] = [];
  for (const step of TEMPLATE_SCENARIOS[template].steps)
    for (const param of step.params ?? []) if (!names.includes(param.name)) names.push(param.name);
  return names;
}

/** 参数说明按参数名索引；同一参数名在模板间含义一致。 */
export function workflowParamHint(name: string, language: ScenarioLanguage): string | undefined {
  for (const scenario of Object.values(TEMPLATE_SCENARIOS)) {
    const text = scenario.paramText[name];
    if (text) return text.hint[language];
  }
  return undefined;
}

export interface ScenarioDeliverables {
  delivered: string[];
  unverified: string[];
}
/**
 * 夹具判定：只有结果已知且成功的步骤产出的引用才算交付。
 * 只用于离线测试核对夹具；运行期交付结论仍由服务端的既有投影给出。
 */
export function fixtureDeliverables(
  scenario: TemplateScenario,
  fixture: ScenarioFixture,
): ScenarioDeliverables {
  const delivered = new Set<string>();
  for (const step of fixture.steps)
    if (step.status === "succeeded" && step.resultKnown)
      for (const ref of step.outputs ?? []) delivered.add(ref.name);
  const names = scenarioOutputNames(scenario);
  return {
    delivered: names.filter((name) => delivered.has(name)),
    unverified: names.filter((name) => !delivered.has(name)),
  };
}

/** 媒体产物只能是真实的创作输出引用；文本、占位或内联字节都不算。 */
export function mediaRefProblem(ref: StudioOutputRef): string | undefined {
  if (ref.kind !== "creation-output") return `${ref.name} is not a creation output.`;
  if (!ref.creationJobId || !ref.outputId) return `${ref.name} has no creation identity.`;
  return undefined;
}
/** 夹具产物扫描：产物内容不允许用这些字符串冒充真实文件或图片。 */
export const PLACEHOLDER_PATTERN = /data:image\/|\bplaceholder\b|占位/iu;
