// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// cron 工具的参数 schema 与九条交叉约束。
//
// 依据：`specs/contracts/kernel-plugin-tools-01/behavior.md` B2 / B3 / B4 / §B。
//
// ⚠️ 为什么字段级校验要移到执行体：
//   DSH 的 `ValueSchemaSpec` **只有** `type` / `enum` / `const` 与四个注解字段，
//   **没有** `min` / `max` / `minLength` / 变换。所以旧实现靠 zod 在字段阶段做的
//   「trim、非空、正数、上限」在本包必须由执行体承担（B3）。

/** 间隔单位（B3 的 `interval-unit-enum` 与 B2 的字段）。 */
export const CRON_INTERVAL_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
] as const;

export type CronIntervalUnit = (typeof CRON_INTERVAL_UNITS)[number];

/** `delayMinutes` 的上限：525_600 分钟 = 365 天（B3 的 `delay-minutes-in-range`）。 */
export const CRON_MAX_DELAY_MINUTES = 525_600;

/** `interval` 的下限与上限（B9 的 `interval-within-range`）。 */
export const CRON_MIN_INTERVAL = 1;
export const CRON_MAX_INTERVAL = 200;

/**
 * 九条交叉约束的名字（§B）。
 *
 * **名字即定位**：测试与错误消息都用它，这样「哪一条生效了」是可断言的 ——
 * 只测「非法输入会失败」无法区分约束。
 */
export const CRON_CREATE_CONSTRAINTS = [
  "cron-required-without-delay",
  "relative-delay-omits-cron",
  "relative-delay-is-one-shot",
  "relative-delay-has-no-max-runs",
  "interval-unit-excludes-delay",
  "interval-unit-pairs-with-interval",
  "interval-unit-requires-recurring",
  "interval-unit-has-no-max-runs",
  "interval-within-range",
] as const;

export type CronCreateConstraint = (typeof CRON_CREATE_CONSTRAINTS)[number];

/** 字段级校验的约束名（B3）。 */
export const CRON_FIELD_CONSTRAINTS = [
  "title-not-blank",
  "cron-not-blank",
  "delay-minutes-in-range",
  "max-runs-positive-integer",
  "interval-unit-enum",
] as const;

export type CronFieldConstraint = (typeof CRON_FIELD_CONSTRAINTS)[number];

/**
 * `CronCreate` 的模型输入（B2 的 8 个字段）。
 *
 * ⚠️ `delayMinutes` 是 `number | null` —— 因为旧契约它是「必填可空」，
 * 旧调用方会显式传 `null`（B4）。
 */
export interface CronCreateArgs {
  readonly cron?: string;
  readonly delayMinutes?: number | null;
  readonly prompt?: string;
  readonly title?: string;
  readonly recurring?: boolean;
  readonly maxRuns?: number;
  readonly intervalUnit?: string;
  readonly interval?: number;
}

/** `CronUpdate` 的模型输入：`id` + 8 个字段（全部可选）。 */
export interface CronUpdateArgs extends CronCreateArgs {
  readonly id: string;
}

/**
 * 一次违反项：约束名 + 可读说明。
 *
 * 用「名字 + 说明」而不是只给名字 —— 因为错误文本要能定位到约束（B3/§B 的断言），
 * 而说明让模型知道怎么改。
 */
export interface CronConstraintViolation {
  readonly constraint: CronCreateConstraint | CronFieldConstraint;
  readonly message: string;
}

/** 判断是否为「给了值」（`null` 视为未给，B4）。 */
function isGiven(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * 收集 `CronCreate` 的全部违反项（**一次报全**，§B 末条）。
 *
 * 顺序即报错优先级 —— 但既然要「一次报全」，顺序只影响文本里的先后。
 *
 * @param args 模型输入
 * @returns 违反项数组（空数组表示通过）
 */
export function violationsOf(args: CronCreateArgs): readonly CronConstraintViolation[] {
  const violations: CronConstraintViolation[] = [];
  const push = (constraint: CronCreateConstraint | CronFieldConstraint, message: string): void => {
    violations.push({ constraint, message });
  };

  // ── 字段级校验（B3）─────────────────────────────
  if (isGiven(args.title) && String(args.title).trim().length === 0) {
    push("title-not-blank", "title must not be blank when provided");
  }
  if (isGiven(args.cron) && String(args.cron).trim().length === 0) {
    push("cron-not-blank", "cron must not be blank when provided");
  }
  if (isGiven(args.delayMinutes)) {
    const delay = args.delayMinutes as number;
    const valid = Number.isInteger(delay) && delay > 0 && delay <= CRON_MAX_DELAY_MINUTES;
    if (!valid) {
      push(
        "delay-minutes-in-range",
        `delayMinutes must be a positive integer no greater than ${CRON_MAX_DELAY_MINUTES}`,
      );
    }
  }
  if (isGiven(args.maxRuns)) {
    const maxRuns = args.maxRuns as number;
    if (!Number.isInteger(maxRuns) || maxRuns <= 0) {
      push("max-runs-positive-integer", "maxRuns must be a positive integer");
    }
  }
  if (
    isGiven(args.intervalUnit) &&
    !CRON_INTERVAL_UNITS.includes(args.intervalUnit as CronIntervalUnit)
  ) {
    push("interval-unit-enum", `intervalUnit must be one of ${CRON_INTERVAL_UNITS.join(", ")}`);
  }

  // ── 九条交叉约束（§B）─────────────────────────────
  const hasDelay = isGiven(args.delayMinutes);
  const hasCron = isGiven(args.cron);
  const hasIntervalUnit = isGiven(args.intervalUnit);
  const hasInterval = isGiven(args.interval);

  // 1. 没给 delayMinutes 且没给 cron
  if (!hasDelay && !hasCron) {
    push("cron-required-without-delay", "cron is required when delayMinutes is not set");
  }
  // 2. 给了 delayMinutes 又给 cron
  if (hasDelay && hasCron) {
    push(
      "relative-delay-omits-cron",
      "a relative delay must omit cron; the host computes the schedule from its real clock",
    );
  }
  // 3. 给了 delayMinutes 又 recurring: true
  if (hasDelay && args.recurring === true) {
    push(
      "relative-delay-is-one-shot",
      "a relative delay creates a one-shot automation and cannot use recurring=true",
    );
  }
  // 4. 给了 delayMinutes 又给 maxRuns
  if (hasDelay && isGiven(args.maxRuns)) {
    push("relative-delay-has-no-max-runs", "a relative delay runs once and cannot use maxRuns");
  }
  // 5. 给了 intervalUnit 又给 delayMinutes
  if (hasIntervalUnit && hasDelay) {
    push(
      "interval-unit-excludes-delay",
      "intervalUnit is a recurring carrier and cannot combine with a relative delayMinutes",
    );
  }
  // 6. intervalUnit 与 interval 只给其一
  if (hasIntervalUnit !== hasInterval) {
    push("interval-unit-pairs-with-interval", "intervalUnit and interval must be set together");
  }
  // 7. 给了 intervalUnit 又 recurring: false
  if (hasIntervalUnit && args.recurring === false) {
    push(
      "interval-unit-requires-recurring",
      "intervalUnit is a recurring carrier and requires recurring=true",
    );
  }
  // 8. 给了 intervalUnit 又给 maxRuns
  if (hasIntervalUnit && isGiven(args.maxRuns)) {
    push(
      "interval-unit-has-no-max-runs",
      "intervalUnit is a recurring carrier and cannot combine with maxRuns",
    );
  }
  // 9. interval 非 1–200 整数
  if (hasInterval) {
    const interval = args.interval as number;
    const valid =
      Number.isInteger(interval) && interval >= CRON_MIN_INTERVAL && interval <= CRON_MAX_INTERVAL;
    if (!valid) {
      push(
        "interval-within-range",
        `interval must be an integer between ${CRON_MIN_INTERVAL} and ${CRON_MAX_INTERVAL}`,
      );
    }
  }

  return violations;
}

/**
 * 把违反项拼成一条错误文本（§B「一次报全」）。
 *
 * 格式：`Invalid cron automation: <name>: <message>; <name>: <message>`
 * —— 每个违反项都带约束名，便于测试与模型定位。
 */
export function formatViolations(violations: readonly CronConstraintViolation[]): string {
  return violations.map((v) => `${v.constraint}: ${v.message}`).join("; ");
}
