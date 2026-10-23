// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 离峰族工具：`OffPeakCreate` / `OffPeakList` 的执行体。
//
// 依据：`specs/contracts/kernel-plugin-tools-02/behavior.md` B3（闭环）/ B8（缺失失败）
//      / B9（自动化轮次）。
//
// ⚠️ 本包不读写文件系统 —— 存储由宿主注入的 `OffPeakPort` 负责。
import type { OffPeakCreateInput, OffPeakPort, OffPeakTaskSummary } from "@knorvia/contracts";

/** 离峰端口不可用时的固定文案（B8）。 */
const PORT_UNAVAILABLE = "Off-peak scheduling is not available in this session";

/** 自动化轮次内禁止创建的固定文案（B9）。 */
const AUTOMATION_TURN_WRITE = "Off-peak windows cannot be created from within an automation turn";

/** 时间窗口字段（B3：必须成对出现）。 */
const WINDOW_FIELD_PAIRS = [
  ["windowStart", "windowEnd"],
  ["startHour", "endHour"],
] as const;

/** 执行上下文。 */
export interface OffPeakCallContext {
  readonly getOffPeakPort: () => OffPeakPort | undefined;
  readonly automationTurn?: boolean;
}

/** 取端口；不可用则抛错（B8 —— 不返回空列表、不返回成功）。 */
function requirePort(context: OffPeakCallContext): OffPeakPort {
  const port = context.getOffPeakPort();
  if (port === undefined) throw new Error(PORT_UNAVAILABLE);
  return port;
}

/**
 * 校验时间窗口字段成对（B3）。
 *
 * 为什么必须成对：一个窗口有起有止；只给一半会让调度器无法判断区间。
 * 这里用「按对检查」而不是「逐字段必填」—— 因为两套窗口字段是可选的，
 * 但**给了就必须成对**。
 */
export function windowPairViolations(args: Record<string, unknown>): readonly string[] {
  const violations: string[] = [];
  for (const [first, second] of WINDOW_FIELD_PAIRS) {
    const hasFirst = args[first] !== undefined && args[first] !== null;
    const hasSecond = args[second] !== undefined && args[second] !== null;
    if (hasFirst !== hasSecond) {
      violations.push(`${first} and ${second} must be provided together`);
    }
  }
  return violations;
}

/** `OffPeakCreate` 的执行体。 */
export async function executeOffPeakCreate(
  args: Record<string, unknown>,
  context: OffPeakCallContext,
): Promise<{ task: OffPeakTaskSummary }> {
  // B9：自动化轮次内禁止创建（防递归）。
  if (context.automationTurn === true) throw new Error(AUTOMATION_TURN_WRITE);

  const port = requirePort(context);

  // B3：窗口字段成对。
  const violations = windowPairViolations(args);
  if (violations.length > 0) {
    throw new Error(`Invalid off-peak window: ${violations.join("; ")}`);
  }

  // B3：端口返回判别联合 —— **失败也是正常结果**（不是异常）。
  const outcome = await port.create(args as unknown as OffPeakCreateInput);
  if (!outcome.ok) {
    // 失败要带「卡在哪一段 / 属于哪一类 / 原始错误码」三件事（端口契约的要求）。
    const error = new Error(
      `Off-peak window could not be created: ${outcome.errorCategory} (${outcome.errorCode})`,
    );
    (
      error as Error & { failureStage: string; errorCategory: string; errorCode: string }
    ).failureStage = outcome.failureStage;
    (error as Error & { errorCategory: string }).errorCategory = outcome.errorCategory;
    (error as Error & { errorCode: string }).errorCode = outcome.errorCode;
    throw error;
  }
  return { task: outcome.task };
}

/** `OffPeakList` 的执行体（只读 → 不受 B9 限制）。 */
export async function executeOffPeakList(
  context: OffPeakCallContext,
): Promise<{ windows: readonly OffPeakTaskSummary[] }> {
  const port = requirePort(context);
  return { windows: await port.list() };
}
