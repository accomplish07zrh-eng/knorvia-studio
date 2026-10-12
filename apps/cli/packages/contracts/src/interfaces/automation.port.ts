// SPDX-License-Identifier: Apache-2.0
// ════════════════════════════════════════════════════════════
// 定时任务端口 —— 活在会话之外的 cron 自动化边界
// ════════════════════════════════════════════════════════════
// 定时任务归宿主所有：它按 cron 表达式在后台自己醒来，触发时刻可能远晚于创建它的那次对话，甚至那次
// 会话早就关了。这里描述的是工具层与宿主之间那层最小的读写契约——cron 解析、调度与持久化都是实现方
// 的事，边界上只关心「建/改/列/删」四种操作，以及创建数量被上限拦住时的表达方式。

// 章节：一 端口入参与能力 · 二 创建上限的失败语汇

import type {
  CronAutomation,
  CronCreateInput,
  CronDeleteInput,
  CronUpdateInput,
} from "../tools/automation.js";

// ── 一、端口入参与能力：一次操作由谁描述 ─────────────────────────────

/** 创建任务时由执行器随调用塞进来的运行时事实，**不是模型输入**：模型只能填工具 schema 里的字段， 模型名与所在会话由当前 runtime 补。会话 id 也决定了这个任务以后在哪个会话里跑。 */
export interface AutomationCreateContext {
  model?: string;
  sessionId?: string;
}

/** 定时任务端口的能力面：增、改、查、删各一条，实现方负责把调度器与存储接上去。 */
export interface AutomationPort {
  create(input: CronCreateInput, context?: AutomationCreateContext): Promise<CronAutomation>;
  update(input: CronUpdateInput): Promise<CronAutomation>;
  list(): Promise<CronAutomation[]>;
  delete(input: CronDeleteInput): Promise<boolean>;
}

// ── 二、创建上限的失败语汇：撞上数量上限时怎么表达 ───────────────────

/** 创建任务被数量上限挡下时使用的稳定错误码。它会同时出现在错误对象的 code 字段与 message 文本里， 因为跨进程或经过序列化之后对象身份会丢，字符串形式的这串码是最后一道可识别标记。 */
export const AUTOMATION_CREATE_LIMIT_ERROR_CODE = "AUTOMATION_CREATE_LIMIT_REACHED";

/** 触及创建上限时抛出的错误；code 恒为上面的取值，原始失败经 cause 透传。 */
export class AutomationCreateLimitError extends Error {
  readonly code = AUTOMATION_CREATE_LIMIT_ERROR_CODE;
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AutomationCreateLimitError";
    this.cause = cause;
  }
}

/** 兜底判别要俯视的字段形状，只在本文件内用于接纳跨边界重建的普通对象。 */
type AutomationCreateLimitLike = { code?: unknown; message?: unknown };

/** 在普通对象上找错误码：先看结构化字段，再看跨进程后仅剩的 message 文本。 */
function looksLikeCreateLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as AutomationCreateLimitLike;
  if (candidate.code === AUTOMATION_CREATE_LIMIT_ERROR_CODE) return true;
  return (
    typeof candidate.message === "string" &&
    candidate.message.includes(AUTOMATION_CREATE_LIMIT_ERROR_CODE)
  );
}

/** 判断某个抛出物是否表示「创建数量已到上限」。判定分两级：本进程内构造的实例直接认；其余对象退到 code 与 message 上找错误码——工具错误穿过 IPC 或 JSON 边界后实例关系不再成立，但错误码还在。 */
export function isAutomationCreateLimitError(error: unknown): error is AutomationCreateLimitError {
  if (error instanceof AutomationCreateLimitError) return true;
  return looksLikeCreateLimitError(error);
}
