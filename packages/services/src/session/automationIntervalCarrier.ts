// SPDX-License-Identifier: Apache-2.0
// Modified 2026-09-30: ordered carrier admission through the shared internal constraint executor.
import type {
  KnorviaAutomationIntervalUnit,
  KnorviaAutomationScheduleRule,
  KnorviaAutomationUpdateParams,
} from "@knorvia/shared";

import {
  assertAutomationAdmission,
  type AutomationAdmissionConstraint,
} from "#src/session/automationAdmissionConstraints.js";

/** 会话侧自定义重复 carrier 的受控上限；不要收紧管理页历史 scheduleRule 的领域上限。 */
const MAX_SESSION_AUTOMATION_INTERVAL = 200;

/** 会话侧自定义重复 carrier 配对、范围或互斥校验失败。 */
export class InvalidAutomationIntervalCarrierError extends Error {
  constructor(message: string) {
    super(`非法的自定义重复入参：${message}`);
    this.name = "InvalidAutomationIntervalCarrierError";
  }
}

/**
 * 校验会话 Cron 工具与 UI 共用的 interval carrier。
 *
 * intervalUnit + interval 是受控输入，服务层必须再次校验，避免旧客户端或内部调用绕过
 * contract/protocol 后写入超出 UI 语义的间隔。`scheduleRule: null` 是 update 的显式清除
 * 语义，也不能与 carrier 混用，否则无法确定是新建规则还是清除规则。
 */
type IntervalCarrier = {
  intervalUnit?: KnorviaAutomationIntervalUnit;
  interval?: number;
  scheduleRule?: KnorviaAutomationScheduleRule | null;
  relativeDelayMinutes?: number;
  recurring?: boolean;
  maxRuns?: number | null;
};

const CARRIER_ADMISSION: readonly AutomationAdmissionConstraint<IntervalCarrier>[] = [
  [
    ({ intervalUnit, interval }) => (intervalUnit === undefined) !== (interval === undefined),
    "intervalUnit 与 interval 必须同时提交或同时省略",
  ],
  [
    ({ interval }) =>
      interval !== undefined &&
      (!Number.isInteger(interval) || interval < 1 || interval > MAX_SESSION_AUTOMATION_INTERVAL),
    "interval 必须是 1-200 的整数",
  ],
  [
    ({ intervalUnit, relativeDelayMinutes }) =>
      intervalUnit !== undefined && relativeDelayMinutes !== undefined,
    "intervalUnit 是周期 carrier，不能与一次性 relativeDelayMinutes 同时提交",
  ],
  [
    ({ intervalUnit, scheduleRule }) => intervalUnit !== undefined && scheduleRule !== undefined,
    "intervalUnit carrier 不能与直传 scheduleRule 同时提交",
  ],
  [
    ({ intervalUnit, recurring }) => intervalUnit !== undefined && recurring === false,
    "intervalUnit carrier 必须使用 recurring=true",
  ],
  [
    ({ intervalUnit, maxRuns }) => intervalUnit !== undefined && typeof maxRuns === "number",
    "intervalUnit carrier 不能与有限 maxRuns 同时提交",
  ],
];

export function assertValidAutomationIntervalCarrier(input: {
  intervalUnit?: KnorviaAutomationIntervalUnit;
  interval?: number;
  scheduleRule?: KnorviaAutomationScheduleRule | null;
  relativeDelayMinutes?: number;
  recurring?: boolean;
  maxRuns?: number | null;
}): void {
  // 保留旧入口一次性读取全部字段的顺序；后续约束仅访问这次输入快照，不重复触发 getter。
  const { intervalUnit, interval, scheduleRule, relativeDelayMinutes, recurring, maxRuns } = input;
  assertAutomationAdmission(
    { intervalUnit, interval, scheduleRule, relativeDelayMinutes, recurring, maxRuns },
    CARRIER_ADMISSION,
    InvalidAutomationIntervalCarrierError,
  );
}

/** carrier 更新必须原子切换无限循环，避免 scheduleRule 与生命周期模式脱节。 */
export function forceIntervalCarrierRecurring(
  params: KnorviaAutomationUpdateParams,
): KnorviaAutomationUpdateParams {
  return { ...params, recurring: true, maxRuns: null };
}
