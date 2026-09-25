import type {
  StudioKernelId,
  StudioOutputRef,
  StudioPermission,
  StudioWorkflowParam,
} from "@knorvia/services";

/**
 * 内置工作流模板的场景数据契约（T08）。
 *
 * 只描述"模板长什么样"：最小参数、提示词、产出声明、执行要求，以及离线测试用的
 * 示例输入 / 正常输出夹具 / 失败夹具。图的构造在 `types.ts`，运行期判定仍由服务端负责。
 * 数据在 `templateScenarioChecks.ts` 与 `templateScenarioDelivery.ts`，
 * 组装与纯函数在 `templateScenarios.ts`，规格见 `specs/knorvia-workflow-templates.md`。
 */
export const TASK_TEMPLATES = [
  "releaseCheck",
  "codeReview",
  "documentCleanup",
  "contentPack",
] as const;
export type TaskTemplate = (typeof TASK_TEMPLATES)[number];
export type ScenarioLanguage = "zh" | "en";

export interface ScenarioText {
  zh: string;
  en: string;
}
/** 参数的展示文案；`label` 在构造图时写入参数 schema，`hint` 只用于界面提示。 */
export interface ScenarioParamText {
  label: ScenarioText;
  hint: ScenarioText;
}
/** 参数 schema 的语言无关部分；`label` 由场景文案按当前语言补上。 */
export type TemplateParamSpec = Omit<StudioWorkflowParam, "label">;
export interface TemplateStep {
  /** 稳定步骤键：夹具与测试用它定位节点，不依赖运行时随机节点 id。 */
  key: string;
  kind: "agent" | "creation" | "approval";
  label: ScenarioText;
  prompt: ScenarioText;
  params?: TemplateParamSpec[];
  outputNames?: string[];
  permission?: StudioPermission;
  creationModelId?: string;
}
export interface ScenarioStepFixture {
  /** 对应 `TemplateStep.key`。 */
  key: string;
  status: "succeeded" | "failed" | "cancelled" | "skipped";
  resultKnown: boolean;
  text?: string;
  error?: string;
  /** 只允许 T06 的结构化引用；夹具不内联媒体字节。 */
  outputs?: StudioOutputRef[];
  /** 输出契约版本；带 `outputs` 时必须给出，否则读取侧按 legacy 忽略引用。 */
  version?: number;
}
export interface ScenarioFixture {
  /** 运行终态；夹具只取 succeeded / failed，不把"未知"写成完成。 */
  state: "succeeded" | "failed";
  resultKnown: boolean;
  input: ScenarioText;
  /** 该夹具假定的内核；只读场景用它说明为什么会在排队前被拒绝。 */
  kernel?: StudioKernelId;
  /** 生产代码里应出现的可读错误（正则源）；用于把失败夹具锚定到真实报错。 */
  errorPattern?: string;
  errorKind: string;
  steps: ScenarioStepFixture[];
}
export interface TemplateScenario {
  id: TaskTemplate;
  paramText: Record<string, ScenarioParamText>;
  steps: TemplateStep[];
  exampleInput: ScenarioText;
  normal: ScenarioFixture;
  failure: ScenarioFixture;
}
