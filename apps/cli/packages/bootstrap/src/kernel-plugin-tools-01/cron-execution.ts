// SPDX-License-Identifier: Apache-2.0
// cron 族四个工具的执行体：把「DSH 的工具调用」翻译成「宿主 AutomationPort 的一次操作」。
//
// 分工：
//   · 本文件只管「一次操作怎么走完」——校验 → 准入 → 调端口 → 归一输出；
//   · 工具名、文案、超时预算在 `cron-declaration.ts`；
//   · 四个工具的 schema 在 `cron-schema.ts`。
//
// 与旧实现的关键差异：旧实现用「工厂 + switch(operation)」在一个文件里做四件事，
// 这里把「操作描述」抽成数据（`CRON_OPERATIONS`），执行体只有一条流水线。
// 收益不只是少写分支：新增一个操作时只加一条描述，流水线不动。
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type {
  AutomationPort,
  CronAutomation,
  CronCreateInput,
  CronDeleteInput,
  CronUpdateInput,
} from "@knorvia/contracts";
import {
  AUTOMATION_CREATE_LIMIT_ERROR_CODE,
  isAutomationCreateLimitError,
} from "@knorvia/contracts";

/** 宿主要提供的定时任务能力（由插件 config 注入，不在工具内直接依赖实现）。 */
export type CronPortProvider = () => AutomationPort | undefined;

/** 四个操作的名字（与工具名一致，模型可见面不可改）。 */
export type CronOperation = "CronCreate" | "CronList" | "CronUpdate" | "CronDelete";

/** 一次调用的运行时事实：来自 DSH 的执行上下文，不是模型入参。 */
export interface CronCallContext {
  /** 当前会话 id：创建时绑定，后续触发不新建会话。 */
  readonly sessionId: string | undefined;
  /** 当前模型标识（`providerId/modelId`）：创建时随调用写入。 */
  readonly model: string | undefined;
}

/**
 * 模型可见面**不包含**的字段。
 *
 * 实测确认（`CronAutomationSchema.safeParse`）：`modelSelection` 与 `mode` 都是
 * `.optional()`，所以「不给模型看」不会让输出校验失败；反过来「多给未知键」才会失败。
 * 因此这两个字段的排除是**契约允许的、旧实现有意为之的**行为，本实现照此保留。
 *
 * 它们为什么不给模型看：`modelSelection` 是任务内部调度的 provider/model 配置，
 * `mode` 是任务创建时的工作模式 —— 两者都是宿主调度用的状态，模型改不了也不该依赖。
 */
const MODEL_HIDDEN_FIELDS = ["modelSelection", "mode"] as const;

/** 模型可见字段的类型面：契约类型去掉内部字段。 */
type ModelVisibleField = Exclude<keyof CronAutomation, (typeof MODEL_HIDDEN_FIELDS)[number]>;

/**
 * 取模型可见字段名的运行时列表。
 *
 * 用「契约类型推导 + 运行时排除」而不是硬编码 12 个字段名：
 * 硬编码的失效方式是「漏写」（旧实现就漏过 `scheduleRule`，导致「每 N 分钟」被
 * 显示成「每小时」）。这里改为「类型上是 `ModelVisibleField` 即包含」，
 * 漏写从「可能」变成「不可能」，而排除项仍只有显式的两个。
 *
 * 由于 `keyof` 在运行时不存在，字段名仍需一个来源：用 `Object.keys` 读端口返回的
 * 实际记录，再按类型收窄 —— 这样契约新增字段会自动进入可见面。
 *
 * @param value - 端口返回的完整任务记录。
 * @returns 模型可见字段名。
 */
function visibleFieldsOf(value: CronAutomation): ModelVisibleField[] {
  const hidden = new Set<string>(MODEL_HIDDEN_FIELDS);
  return (Object.keys(value) as ModelVisibleField[]).filter((field) => !hidden.has(field));
}

/**
 * 把端口返回的完整任务投影成模型可见快照。
 *
 * 投影用 `Reflect.get` 读值：端口即使返回带 getter 的记录，也按属性读取，
 * 不会把访问器展开成普通属性。
 *
 * @param value - 端口返回的完整任务记录。
 * @returns 模型可见的快照。
 */
function projectAutomation(value: CronAutomation): CronAutomation {
  const projected: Record<string, unknown> = {};
  for (const field of visibleFieldsOf(value)) {
    projected[field] = Reflect.get(value, field);
  }
  return projected as unknown as CronAutomation;
}

/** 端口缺失时的稳定拒绝文案（与旧实现同义：不是「没有任务」而是「能力不可用」）。 */
const PORT_UNAVAILABLE = "Scheduled automations are not available in this session";

/**
 * 从 DSH 执行上下文里取「调用方是不是自动化轮次」。
 *
 * 自动化轮次不能再创建自动化 —— 否则一条自动化会无限递归地造出新的自动化。
 * 旧实现由宿主的 `rejectAutomationTurn` 承担；这里把判定放在执行体入口，
 * 因为 DSH 侧没有对应的宿主回调。
 *
 * @param exec - DSH 的执行上下文。
 * @returns 是否处于自动化轮次。
 */
function isAutomationTurn(exec: ToolRunContext): boolean {
  const meta = (exec as { metadata?: { automationTurn?: unknown } }).metadata;
  return meta?.automationTurn === true;
}

/**
 * 拒绝在自动化轮次内做写操作。
 *
 * @param operation - 本次操作名。
 * @param exec - DSH 执行上下文。
 * @throws 处于自动化轮次时抛错（文案含操作名，便于定位）。
 */
function assertNotAutomationTurn(operation: CronOperation, exec: ToolRunContext): void {
  if (!isAutomationTurn(exec)) return;
  throw new Error(`${operation} cannot run inside a scheduled automation turn`);
}

/**
 * 取端口；缺失时抛明确错误。
 *
 * @param provider - config 注入的端口提供者。
 * @returns 可用的端口。
 * @throws 端口不可用时抛错。
 */
function requirePort(provider: CronPortProvider): AutomationPort {
  const port = provider();
  if (port === undefined) throw new Error(PORT_UNAVAILABLE);
  return port;
}

/** 四个操作共用的一条流水线。 */
export interface CronPipeline {
  readonly port: CronPortProvider;
  /** 从 DSH 执行上下文提取会话与模型。 */
  readonly callContext: (exec: ToolRunContext) => CronCallContext;
}

/**
 * 执行一次 `CronCreate`。
 *
 * @param input - 已通过 schema 校验的创建参数。
 * @param exec - DSH 执行上下文。
 * @param pipeline - 端口与上下文提取器。
 * @returns 新建任务的模型可见快照与确认文案。
 */
export async function runCronCreate(
  input: CronCreateInput,
  exec: ToolRunContext,
  pipeline: CronPipeline,
): Promise<{ automation: CronAutomation; message: string }> {
  assertNotAutomationTurn("CronCreate", exec);
  const port = requirePort(pipeline.port);
  const context = pipeline.callContext(exec);
  const automation = await createWithLimitMapping(port, input, context);
  return {
    automation: projectAutomation(automation),
    message: `Created automation ${automation.automationId}.`,
  };
}

/**
 * 调端口创建，并把「数量上限」这一种失败翻译成稳定错误码。
 *
 * 为什么单独包一层：上限不是异常情况，是产品语义（用户有配额），
 * 所以要让调用方拿到可识别的错误码而不是一段自由文本。
 *
 * @param port - 定时任务端口。
 * @param input - 创建参数。
 * @param context - 会话与模型事实。
 * @returns 新建的任务。
 * @throws 触及上限时抛带错误码的 Error。
 */
async function createWithLimitMapping(
  port: AutomationPort,
  input: CronCreateInput,
  context: CronCallContext,
): Promise<CronAutomation> {
  try {
    const createContext = {
      ...(context.model === undefined ? {} : { model: context.model }),
      ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
    };
    return await port.create(input, createContext);
  } catch (error) {
    if (!isAutomationCreateLimitError(error)) throw error;
    const limited = new Error(
      `Automation create limit reached (${AUTOMATION_CREATE_LIMIT_ERROR_CODE})`,
    );
    limited.cause = error;
    throw limited;
  }
}

/**
 * 执行一次 `CronList`。
 *
 * @param exec - DSH 执行上下文。
 * @param pipeline - 端口与上下文提取器。
 * @returns 全部任务的模型可见快照。
 */
export async function runCronList(
  exec: ToolRunContext,
  pipeline: CronPipeline,
): Promise<{ automations: CronAutomation[] }> {
  const port = requirePort(pipeline.port);
  const automations = await port.list();
  return { automations: automations.map(projectAutomation) };
}

/**
 * 执行一次 `CronUpdate`。
 *
 * @param input - 已校验的更新参数（只含要改的字段）。
 * @param exec - DSH 执行上下文。
 * @param pipeline - 端口与上下文提取器。
 * @returns 更新后的模型可见快照与确认文案。
 */
export async function runCronUpdate(
  input: CronUpdateInput,
  exec: ToolRunContext,
  pipeline: CronPipeline,
): Promise<{ automation: CronAutomation; message: string }> {
  assertNotAutomationTurn("CronUpdate", exec);
  const port = requirePort(pipeline.port);
  const automation = await port.update(input);
  return {
    automation: projectAutomation(automation),
    message: `Updated automation ${automation.automationId}.`,
  };
}

/**
 * 执行一次 `CronDelete`。
 *
 * 删除「没找到」不是错误（幂等）：返回 `deleted: false` + 说明文案，
 * 让模型能区分「删掉了」与「本来就没有」，而不是收到一个异常。
 *
 * @param input - 已校验的删除参数。
 * @param exec - DSH 执行上下文。
 * @param pipeline - 端口与上下文提取器。
 * @returns 是否删除、目标 id 与说明文案。
 */
export async function runCronDelete(
  input: CronDeleteInput,
  exec: ToolRunContext,
  pipeline: CronPipeline,
): Promise<{ deleted: boolean; id: string; message: string }> {
  assertNotAutomationTurn("CronDelete", exec);
  const port = requirePort(pipeline.port);
  const deleted = await port.delete(input);
  return {
    deleted,
    id: input.id,
    message: deleted
      ? `Deleted automation ${input.id}.`
      : `Automation ${input.id} was not found in the current workspace.`,
  };
}
