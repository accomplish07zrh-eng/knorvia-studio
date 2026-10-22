// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// cron 工具的执行体与投影。
//
// 依据：`specs/contracts/kernel-plugin-tools-01/behavior.md` B7（投影）/ §D（输出）
//      / B8（删除幂等）/ B9（端口不可用）/ B10（自动化轮次）/ B11（上限翻译）。
//
// ⚠️ 本包**不读写文件系统** —— 存储由宿主注入的 `AutomationPort` 负责（B12）。
import type { AutomationPort, CronAutomation } from "@knorvia/contracts";
import { AUTOMATION_CREATE_LIMIT_ERROR_CODE } from "@knorvia/contracts";
import type { CronCreateArgs, CronUpdateArgs } from "./cron-schema.js";
import { formatViolations, violationsOf } from "./cron-schema.js";

/** 投影时隐藏的字段（B7 / known-differences D1）。 */
const MODEL_HIDDEN_FIELDS = ["modelSelection", "mode"] as const;

/**
 * 模型可见的字段集合（B7）。
 *
 * ⚠️ 用**排除表**而不是白名单（D1）：契约新增第 15 个字段时本包会包含它，
 * 而旧实现的白名单不会。当前与旧实现等价（`CronAutomation` 恰好 14 字段）。
 */
export type ModelVisibleField = Exclude<keyof CronAutomation, "modelSelection" | "mode">;

/** 把一条自动化投影成模型可见形状（B7）。 */
export function projectAutomation(automation: CronAutomation): Record<string, unknown> {
  const hidden = new Set<string>(MODEL_HIDDEN_FIELDS);
  return Object.fromEntries(Object.entries(automation).filter(([key]) => !hidden.has(key)));
}

/** 执行上下文：端口与运行时事实。 */
export interface CronCallContext {
  /** 取定时任务端口；返回 undefined 表示当前会话不支持（B9）。 */
  readonly getAutomationPort: () => AutomationPort | undefined;
  /** 当前调用的会话 id（创建时绑定会话）。 */
  readonly sessionId?: string;
  /** 当前调用的模型标识（`providerId/modelId`）。 */
  readonly model?: string;
  /** 是否处于自动化轮次（B10；由宿主在 metadata 上标注）。 */
  readonly automationTurn?: boolean;
}

/** 端口不可用时的固定文案（B9）。 */
const PORT_UNAVAILABLE_MESSAGE = "Scheduled automations are not available in this session";

/** 自动化轮次内禁止写的固定文案（B10）。 */
const AUTOMATION_TURN_WRITE_MESSAGE =
  "Automations cannot be created, updated, or deleted from within an automation turn";

/** 取端口；不可用则抛错（B9 —— 不返回空列表、不返回成功）。 */
function requirePort(context: CronCallContext): AutomationPort {
  const port = context.getAutomationPort();
  if (port === undefined) throw new Error(PORT_UNAVAILABLE_MESSAGE);
  return port;
}

/** 写操作前的守卫（B10）：自动化轮次内禁止写。 */
function assertWritable(context: CronCallContext): void {
  if (context.automationTurn === true) throw new Error(AUTOMATION_TURN_WRITE_MESSAGE);
}

/**
 * 把端口的上限错误翻译成带同一错误码的 `Error`（B11）。
 *
 * 为什么翻译：上限不是异常，是产品语义（用户有配额）；
 * 调用方要拿到可识别的错误码，而 `cause` 保留原始错误。
 */
function translateCreateLimitError(error: unknown): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === AUTOMATION_CREATE_LIMIT_ERROR_CODE
  ) {
    const translated = new Error(`Automation creation limit reached: ${(error as Error).message}`, {
      cause: error,
    });
    // 错误码挂在自身上，调用方不必解析文本。
    (translated as Error & { code: string }).code = AUTOMATION_CREATE_LIMIT_ERROR_CODE;
    return translated;
  }
  return error;
}

/** `CronCreate` 的执行体。 */
export async function executeCronCreate(
  args: CronCreateArgs,
  context: CronCallContext,
): Promise<{ automation: Record<string, unknown>; message: string }> {
  assertWritable(context);
  const port = requirePort(context);

  // B3/§B：约束在执行体入口校验（DSH schema 表达不了）。
  const violations = violationsOf(args);
  if (violations.length > 0) {
    throw new Error(`Invalid cron automation: ${formatViolations(violations)}`);
  }

  let automation: CronAutomation;
  try {
    automation = await port.create(
      // `delayMinutes: null` 等价于「未给」（B4）—— 传给端口前先归一。
      {
        ...args,
        ...(args.delayMinutes === null ? { delayMinutes: undefined } : {}),
      } as Parameters<AutomationPort["create"]>[0],
      {
        ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
        ...(context.model === undefined ? {} : { model: context.model }),
      },
    );
  } catch (error) {
    throw translateCreateLimitError(error);
  }

  return {
    automation: projectAutomation(automation),
    message: `Created automation ${automation.automationId}.`,
  };
}

/** `CronUpdate` 的执行体。 */
export async function executeCronUpdate(
  args: CronUpdateArgs,
  context: CronCallContext,
): Promise<{ automation: Record<string, unknown>; message: string }> {
  assertWritable(context);
  const port = requirePort(context);

  // 更新时字段全可选，所以只对「给了的部分」做字段级校验。
  const violations = violationsOf(args);
  if (violations.length > 0) {
    throw new Error(`Invalid cron automation: ${formatViolations(violations)}`);
  }

  const automation = await port.update({
    ...args,
    ...(args.delayMinutes === null ? { delayMinutes: undefined } : {}),
  } as Parameters<AutomationPort["update"]>[0]);

  return {
    automation: projectAutomation(automation),
    message: `Updated automation ${automation.automationId}.`,
  };
}

/** `CronList` 的执行体（只读 → 不受 B10 限制）。 */
export async function executeCronList(
  context: CronCallContext,
): Promise<{ automations: readonly Record<string, unknown>[] }> {
  const port = requirePort(context);
  const automations = await port.list();
  return { automations: automations.map(projectAutomation) };
}

/** `CronDelete` 的执行体（幂等，B8）。 */
export async function executeCronDelete(
  args: { readonly id: string },
  context: CronCallContext,
): Promise<{ deleted: boolean; id: string; message: string }> {
  assertWritable(context);
  const port = requirePort(context);

  const deleted = await port.delete({ id: args.id } as Parameters<AutomationPort["delete"]>[0]);

  // B8：`false` 不抛错 —— 「本来就没有」与「删掉了」是两种正常结果。
  return {
    deleted,
    id: args.id,
    message: deleted
      ? `Deleted automation ${args.id}.`
      : `${args.id} was not found in the current workspace.`,
  };
}
