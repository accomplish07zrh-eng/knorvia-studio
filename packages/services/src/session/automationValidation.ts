// SPDX-License-Identifier: Apache-2.0
// Modified 2026-09-30: ordered schedule-rule admission; inherited error contracts retained.
import type { KnorviaAutomationScheduleRule } from "@knorvia/shared";
import {
  assertAutomationAdmission,
  type AutomationAdmissionConstraint,
} from "#src/session/automationAdmissionConstraints.js";

// 定时任务的错误类型与自定义调度规则校验；automationService.ts 只保留存储与生命周期逻辑。
/** 无效 cron 表达式错误（供管理层向 UI 返回可展示信息）。 */
export class InvalidCronExprError extends Error {
  constructor(cronExpr: string) {
    super(`非法的 cron 表达式：${cronExpr}`);
    this.name = "InvalidCronExprError";
  }
}

/** 非法的有限次数更新错误；用于阻止矛盾状态写入并误结束仍在运行的任务。 */
export class InvalidAutomationMaxRunsUpdateError extends Error {
  constructor(message = "清空 maxRuns 时必须在同一次更新中设置 recurring=true") {
    super(message);
    this.name = "InvalidAutomationMaxRunsUpdateError";
  }
}

/** 非法自定义调度规则；规则必须先通过领域校验才能写入内部任务库。 */
export class InvalidAutomationScheduleRuleError extends Error {
  constructor(message: string) {
    super(`非法的定时任务调度规则：${message}`);
    this.name = "InvalidAutomationScheduleRuleError";
  }
}

/** 相对延迟只用于一次性任务，并由服务端真实时钟生成调度规则。 */
export class InvalidAutomationRelativeDelayError extends Error {
  constructor(message: string) {
    super(`非法的相对时间定时任务：${message}`);
    this.name = "InvalidAutomationRelativeDelayError";
  }
}

const MAX_MONTHLY_AUTOMATION_SCHEDULE_INTERVAL = 1_200;
const AUTOMATION_SCHEDULE_RULE_UNITS = new Set([
  "minute",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

function hasOnlyIntegersInRange(values: number[] | undefined, min: number, max: number): boolean {
  return Boolean(
    values?.length &&
    values.every((value) => Number.isInteger(value) && value >= min && value <= max),
  );
}

const RULE_ADMISSION: readonly AutomationAdmissionConstraint<KnorviaAutomationScheduleRule>[] = [
  [(rule) => !AUTOMATION_SCHEDULE_RULE_UNITS.has(rule.unit), "unit 不受支持"],
  [(rule) => !Number.isInteger(rule.interval) || rule.interval < 1, "interval 必须是正整数"],
  [
    (rule) => rule.unit === "monthly" && rule.interval > MAX_MONTHLY_AUTOMATION_SCHEDULE_INTERVAL,
    `monthly interval 不能超过 ${MAX_MONTHLY_AUTOMATION_SCHEDULE_INTERVAL}`,
  ],
  [
    (rule) => !Number.isInteger(rule.hour) || rule.hour < 0 || rule.hour > 23,
    "hour 必须是 0-23 的整数",
  ],
  [
    (rule) => !Number.isInteger(rule.minute) || rule.minute < 0 || rule.minute > 59,
    "minute 必须是 0-59 的整数",
  ],
  [
    (rule) =>
      rule.monthlyMode !== undefined &&
      rule.monthlyMode !== "date" &&
      rule.monthlyMode !== "weekday",
    "monthlyMode 不受支持",
  ],
  [
    (rule) => rule.weekdays && !hasOnlyIntegersInRange(rule.weekdays, 0, 6),
    "weekdays 必须是 0-6 的非空整数数组",
  ],
  [
    (rule) => rule.unit === "weekly" && !hasOnlyIntegersInRange(rule.weekdays, 0, 6),
    "weekly 规则必须包含有效的 weekdays",
  ],
  (rule) => {
    // 两个 monthly 子条件共享一次 unit 读取，保留 accessor 输入的旧短路与错误顺序。
    if (rule.unit === "monthly") {
      if (rule.monthlyMode === "weekday" && !hasOnlyIntegersInRange(rule.weekdays, 0, 6)) {
        return "monthly weekday 规则必须包含有效的 weekdays";
      }
      if (rule.monthlyMode !== "weekday" && !hasOnlyIntegersInRange(rule.monthDays, 1, 31)) {
        return "monthly date 规则必须包含有效的 monthDays";
      }
    }
    return undefined;
  },
  [
    (rule) => rule.months && !hasOnlyIntegersInRange(rule.months, 1, 12),
    "months 必须是 1-12 的非空整数数组",
  ],
  [
    (rule) => rule.monthDays && !hasOnlyIntegersInRange(rule.monthDays, 1, 31),
    "monthDays 必须是 1-31 的非空整数数组",
  ],
];

export function assertValidAutomationScheduleRule(rule: KnorviaAutomationScheduleRule): void {
  assertAutomationAdmission(rule, RULE_ADMISSION, InvalidAutomationScheduleRuleError);
}
