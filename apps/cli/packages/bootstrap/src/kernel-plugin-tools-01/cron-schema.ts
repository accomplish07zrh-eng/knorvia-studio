// SPDX-License-Identifier: Apache-2.0
// cron 族四个工具的参数 schema 与交叉约束。
//
// 为什么约束单独成一层：DSH 的 `defineTool.parameters` 只描述「每个字段的形状」，
// 不表达「字段之间不能同时出现」这类关系。旧实现用 zod 的 9 条 `.refine()` 表达，
// 这里把它们收进一个可逐条断言的函数（`violationsOf`），好处是：
//   · 每条约束有名字，测试能定位到具体哪一条被违反；
//   · 错误消息里能给出「哪两个字段冲突」，而不只是「参数非法」。
import type { ValueSchemaSpec } from "@deepseek-ai/dsh-tools";

/** `CronCreate` 的参数形状（字段级）。 */
/**
 * `delayMinutes` 的字段 schema：数字或 `null`。
 *
 * 为什么必须允许 `null`：旧契约的 `delayMinutes` 曾是「必填可空」，
 * 旧调用方与部分 provider 会显式传 `null`。若这里只接受 `number`，
 * DSH 的 schema 层会在到达执行体之前就拒绝（实测报错
 * `invalid arguments: "delayMinutes" must be a number`），
 * 于是「`null` 等价于未给」这条兼容语义就无法成立。
 *
 * 用 `oneOf: [number, null]` 表达「数字或 null」，与旧 zod 的 `.nullable()` 对应。
 */
const DELAY_MINUTES_SPEC: ValueSchemaSpec = {
  oneOf: [{ type: "number" }, { type: "null" }],
};

export const CRON_CREATE_PARAMETERS: Record<string, ValueSchemaSpec> = {
  cron: { type: "string" },
  delayMinutes: DELAY_MINUTES_SPEC,
  prompt: { type: "string" },
  title: { type: "string" },
  recurring: { type: "boolean" },
  maxRuns: { type: "number" },
  intervalUnit: { type: "string" },
  interval: { type: "number" },
};

/** `CronList` 无参数。 */
export const CRON_LIST_PARAMETERS: Record<string, ValueSchemaSpec> = {};

/** `CronUpdate` 的参数形状：除 `id` 外全部可选，只改给定字段。 */
export const CRON_UPDATE_PARAMETERS: Record<string, ValueSchemaSpec> = {
  id: { type: "string" },
  cron: { type: "string" },
  delayMinutes: DELAY_MINUTES_SPEC,
  prompt: { type: "string" },
  title: { type: "string" },
  recurring: { type: "boolean" },
  maxRuns: { type: "number" },
  intervalUnit: { type: "string" },
  interval: { type: "number" },
};

/** `CronDelete` 只要 id。 */
export const CRON_DELETE_PARAMETERS: Record<string, ValueSchemaSpec> = {
  id: { type: "string" },
};

/** 合法的 `intervalUnit` 取值（与旧契约的枚举一致）。 */
export const CRON_INTERVAL_UNITS = [
  "minute",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;

/** 一次创建请求里参与交叉约束的字段（其余字段不参与）。 */
export interface CronConstraintInput {
  readonly cron?: string;
  readonly delayMinutes?: number | null;
  readonly recurring?: boolean;
  readonly maxRuns?: number;
  readonly intervalUnit?: string;
  readonly interval?: number;
  /** 标题：只参与字段级校验（非空白），不参与交叉约束。 */
  readonly title?: string;
}

/**
 * 判定「这次请求是不是相对延迟」。
 *
 * 只有**显式的数字**才算相对延迟：`undefined` 与 `null` 都视为「非相对」。
 * 这个口径必须与旧实现一致 —— 旧契约里 `delayMinutes` 曾是「必填可空」，
 * 旧调用方会显式传 `null`；若把 `null` 当相对延迟，会把周期任务错建成一次性。
 *
 * @param input - 创建或更新请求。
 * @returns 是否按相对延迟处理。
 */
export function hasRelativeDelay(input: CronConstraintInput): boolean {
  return typeof input.delayMinutes === "number";
}

/** 一条交叉约束：有名字、可断言、能给出人读的说明。 */
export interface CronConstraint {
  /** 约束名（测试与错误消息都用它定位）。 */
  readonly name: string;
  /** 违反时的说明。 */
  readonly message: string;
  /** 判定本请求是否违反该约束。 */
  readonly violatedBy: (input: CronConstraintInput) => boolean;
}

/**
 * 字段级校验（补 DSH schema 表达力的缺口）。
 *
 * DSH 的 `ValueSchemaSpec` 只有 `type` / `enum` / `const` 与四个注解字段，
 * **没有 `min` / `max` / `minLength` / 变换**。而旧实现靠 zod 在字段阶段做了：
 *   `z.string().trim().min(1)`、`z.number().int().positive().max(525_600)`、
 *   `z.enum([...])`、`z.number().int().min(1).max(200)`。
 * 这些必须在这里补回来，否则非法输入会直接流到端口。
 *
 * 本函数与九条交叉约束分开：字段级是「单个字段是否合法」，
 * 交叉约束是「字段之间是否冲突」。分开后报错顺序也更符合直觉 ——
 * 先报「这个字段本身不合法」，再报「这几个字段不能一起给」。
 *
 * @param input - 创建或更新请求。
 * @returns 违反的字段级约束（空数组表示通过）。
 */
export function fieldViolationsOf(input: CronConstraintInput): CronConstraint[] {
  const violations: CronConstraint[] = [];
  const blank = (value: string | undefined): boolean => value !== undefined && value.trim() === "";

  if (blank(input.cron)) {
    violations.push({
      name: "cron-not-blank",
      message: "cron must not be blank",
      violatedBy: () => true,
    });
  }
  if (blank(input.title)) {
    violations.push({
      name: "title-not-blank",
      message: "title must not be blank",
      violatedBy: () => true,
    });
  }
  if (input.delayMinutes !== undefined && input.delayMinutes !== null) {
    const delay = input.delayMinutes;
    const badDelay = !Number.isInteger(delay) || delay <= 0 || delay > CRON_MAX_DELAY_MINUTES;
    if (badDelay) {
      violations.push({
        name: "delay-minutes-in-range",
        message: `delayMinutes must be a positive integer of at most ${CRON_MAX_DELAY_MINUTES} minutes`,
        violatedBy: () => true,
      });
    }
  }
  if (input.maxRuns !== undefined) {
    const maxRuns = input.maxRuns;
    if (!Number.isInteger(maxRuns) || maxRuns <= 0) {
      violations.push({
        name: "max-runs-positive-integer",
        message: "maxRuns must be a positive integer",
        violatedBy: () => true,
      });
    }
  }
  if (
    input.intervalUnit !== undefined &&
    !(CRON_INTERVAL_UNITS as readonly string[]).includes(input.intervalUnit)
  ) {
    violations.push({
      name: "interval-unit-enum",
      message: `intervalUnit must be one of ${CRON_INTERVAL_UNITS.join(", ")}`,
      violatedBy: () => true,
    });
  }
  return violations;
}

/** `delayMinutes` 的上限：一年（525_600 分钟），与旧契约一致。 */
export const CRON_MAX_DELAY_MINUTES = 525_600;

/**
 * `CronCreate` 的九条交叉约束。
 *
 * 顺序即报错优先级：先报「缺 cron」，再报「相对延迟与其它字段冲突」，
 * 最后报「interval 载体自相矛盾」。这样模型从第一条消息就能知道最该改什么。
 */
export const CRON_CREATE_CONSTRAINTS: readonly CronConstraint[] = [
  {
    name: "cron-required-without-delay",
    message: "cron is required when delayMinutes is not set",
    violatedBy: (input) => !hasRelativeDelay(input) && input.cron === undefined,
  },
  {
    name: "relative-delay-omits-cron",
    message: "a relative delay must omit cron; the host computes the schedule from its real clock",
    violatedBy: (input) => hasRelativeDelay(input) && input.cron !== undefined,
  },
  {
    name: "relative-delay-is-one-shot",
    message: "a relative delay creates a one-shot automation and cannot use recurring=true",
    violatedBy: (input) => hasRelativeDelay(input) && input.recurring === true,
  },
  {
    name: "relative-delay-has-no-max-runs",
    message: "a relative delay runs once and cannot use maxRuns",
    violatedBy: (input) => hasRelativeDelay(input) && input.maxRuns !== undefined,
  },
  {
    name: "interval-unit-excludes-delay",
    message: "intervalUnit is a recurring carrier and cannot combine with a relative delayMinutes",
    violatedBy: (input) => input.intervalUnit !== undefined && hasRelativeDelay(input),
  },
  {
    name: "interval-unit-pairs-with-interval",
    message: "intervalUnit and interval must be set together",
    violatedBy: (input) => (input.intervalUnit === undefined) !== (input.interval === undefined),
  },
  {
    name: "interval-unit-requires-recurring",
    message: "intervalUnit is a recurring carrier and requires recurring=true",
    violatedBy: (input) => input.intervalUnit !== undefined && input.recurring === false,
  },
  {
    name: "interval-unit-has-no-max-runs",
    message: "intervalUnit is a recurring carrier and cannot combine with maxRuns",
    violatedBy: (input) => input.intervalUnit !== undefined && input.maxRuns !== undefined,
  },
  {
    name: "interval-within-range",
    message: "interval must be an integer from 1 to 200",
    violatedBy: (input) =>
      input.interval !== undefined &&
      (!Number.isInteger(input.interval) || input.interval < 1 || input.interval > 200),
  },
];

/**
 * 列出本请求违反的全部约束。
 *
 * 返回数组而不是「抛第一个」：一次调用里可能有多个字段要改，
 * 一次报全比让模型改一轮再撞下一轮更省往返。
 *
 * @param input - 创建请求。
 * @param constraints - 要检查的约束集合（默认 `CRON_CREATE_CONSTRAINTS`）。
 * @returns 违反的约束（空数组表示通过）。
 */
export function violationsOf(
  input: CronConstraintInput,
  constraints: readonly CronConstraint[] = CRON_CREATE_CONSTRAINTS,
): CronConstraint[] {
  return constraints.filter((constraint) => constraint.violatedBy(input));
}

/**
 * 把违反项拼成一条给模型看的错误文本。
 *
 * @param violations - 违反的约束。
 * @returns 错误文本（含每条约束名，便于模型与测试定位）。
 */
export function describeViolations(violations: readonly CronConstraint[]): string {
  const detail = violations.map((item) => `${item.name}: ${item.message}`).join("; ");
  return `Invalid cron arguments — ${detail}`;
}
