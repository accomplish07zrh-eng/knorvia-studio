// SPDX-License-Identifier: Apache-2.0
// Source-exposed independent cron projections, 2026-10-03; prior notices/history retained.
// 定时任务展示层格式化：cron 表达式 → 人类可读的调度摘要 / 相对时间 / cron builder 组装。
// 说明：croner 只在 services 侧用于算下次触发时间；UI 这里仅做「已知常见模式」的可读化，
// 覆盖不到的表达式回退成原始 cron 文本，保证不误导。

export interface IntlLike {
  formatMessage: (descriptor: { id: string }, values?: Record<string, string>) => string;
}

export type AutomationStatusKind = "active" | "paused" | "completed" | "failed";

interface AutomationStatusLike {
  lifecycleStatus: AutomationStatusKind;
  enabled: boolean;
}

interface AutomationFailureLike {
  lifecycleStatus: AutomationStatusKind;
  dispatchStatus?: "idle" | "claimed" | "dispatched" | "failed_to_dispatch";
  dispatchAttempts?: number;
  retryAt?: number;
  lastError?: string;
}

/** 最近一次真实运行/派发失败时展示失败态；循环任务本身仍保持 active 并继续调度。 */
export function hasAutomationFailureState(automation: AutomationFailureLike): boolean {
  return (
    automation.lifecycleStatus === "failed" ||
    automation.dispatchStatus === "failed_to_dispatch" ||
    Boolean(automation.lastError?.trim())
  );
}

/** 定时任务生命周期展示状态：终态优先，其次 paused/enabled，最后 active。 */
export function resolveAutomationStatusKind(
  automation: AutomationStatusLike,
): AutomationStatusKind {
  if (automation.lifecycleStatus === "failed") return "failed";
  if (automation.lifecycleStatus === "completed") return "completed";
  if (automation.lifecycleStatus === "paused" || !automation.enabled) return "paused";
  return "active";
}

/** cron builder 支持的频率类型（覆盖 Feishu 自定义重复里最常用的几种）。 */
export type CronFrequency = "hourly" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
export type CustomRepeatUnit = "minute" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
export type CustomMonthlyMode = "date" | "weekday";

export interface CronBuilderState {
  frequency: CronFrequency;
  /** daily/weekly/monthly 用：0-23 */
  hour: number;
  /** daily/weekly/monthly 用：0-59 */
  minute: number;
  /** weekly 用：0(周日)-6(周六) 的集合 */
  weekdays: number[];
  /** monthly 用：1-31 */
  dayOfMonth: number;
  /** custom 用：原始 5 段 cron */
  rawExpr: string;
  customInterval: number;
  customUnit: CustomRepeatUnit;
  customWeekdays: number[];
  customMonthDays: number[];
  /** yearly 用：1-12 人类月份（日期复用 customMonthDays[0]）。 */
  customMonth: number;
  customMonthlyMode: CustomMonthlyMode;
}

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const pad2 = (value: number): string => String(value).padStart(2, "0");
const AUTOMATION_CARD_RELATIVE_NEXT_RUN_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

export function isSessionCreatedAutomation(
  automation: { targetTaskId?: string } | null | undefined,
): boolean {
  return Boolean(automation?.targetTaskId?.trim());
}

type CronField = string | number;
type CronFields = readonly [CronField, CronField, CronField, CronField, CronField];
type FieldProjection = (state: CronBuilderState) => CronFields;

// 固定时间的 cron 只变化日/周字段；公共五段投影避免重复组装钟点。
const timedFields = (
  state: CronBuilderState,
  day: CronField = "*",
  weekday: CronField = "*",
): CronFields => [state.minute, state.hour, day, "*", weekday];
const fixedFields = new Map<CronFrequency, FieldProjection>([
  ["hourly", (state) => [state.minute, "*", "*", "*", "*"]],
  ["daily", (state) => timedFields(state)],
  ["weekdays", (state) => timedFields(state, "*", "1-5")],
  [
    "weekly",
    (state) =>
      timedFields(
        state,
        "*",
        state.weekdays.length ? [...state.weekdays].sort((a, b) => a - b).join(",") : "*",
      ),
  ],
  ["monthly", (state) => timedFields(state, state.dayOfMonth)],
]);

// 真实 interval 由 scheduleRule 保存；cron 候选超出字段容量时必须仍合法。
const compatibleStep = (interval: number, maximum: number): string =>
  interval <= maximum ? `*/${interval}` : "*";

type CustomFieldProjection = (state: CronBuilderState, interval: number) => CronFields;
const yearlyFields: CustomFieldProjection = (state) => [
  state.minute,
  state.hour,
  state.customMonthDays[0] ?? new Date().getDate(),
  Math.min(12, Math.max(1, Math.floor(state.customMonth))),
  "*",
];
const customFields = new Map<CustomRepeatUnit, CustomFieldProjection>([
  ["minute", (_state, interval) => [compatibleStep(interval, 59), "*", "*", "*", "*"]],
  ["hourly", (state, interval) => [state.minute, compatibleStep(interval, 24), "*", "*", "*"]],
  ["daily", (state, interval) => timedFields(state, compatibleStep(interval, 31))],
  [
    "weekly",
    (state) =>
      timedFields(state, "*", state.customWeekdays.length ? state.customWeekdays.join(",") : "1"),
  ],
  [
    "monthly",
    (state) =>
      state.customMonthlyMode === "weekday"
        ? timedFields(state, "*", `${state.customWeekdays[0] ?? 1}#1`)
        : timedFields(state, state.customMonthDays.length ? state.customMonthDays.join(",") : "1"),
  ],
  ["yearly", yearlyFields],
]);

/** 唯一字段投影入口；不在 UI 推导真正的调度间隔或改写现有 scheduleRule。 */
export function buildCronExpr(state: CronBuilderState): string {
  if (state.frequency !== "custom")
    return fixedFields.get(state.frequency)?.(state).join(" ") ?? state.rawExpr.trim();
  const interval = Math.max(1, Math.floor(state.customInterval));
  return (customFields.get(state.customUnit) ?? yearlyFields)(state, interval).join(" ");
}

function defaultCronBuilder(expr: string): CronBuilderState {
  return {
    frequency: "custom",
    hour: 9,
    minute: 0,
    weekdays: [1],
    dayOfMonth: 1,
    rawExpr: expr,
    customInterval: 1,
    customUnit: "daily",
    customWeekdays: [1],
    customMonthDays: [1],
    customMonth: new Date().getMonth() + 1,
    customMonthlyMode: "date",
  };
}

type CronDecoder = readonly [
  syntax: RegExp,
  decode: (match: RegExpExecArray) => Partial<CronBuilderState> | null,
];
const decodedTime = (match: RegExpExecArray) => ({
  minute: Number(match[1]),
  hour: Number(match[2]),
});

/** 按产品兼容优先级 admission；不把反解析变成新的 cron 合法性校验器。 */
const cronDecoders: readonly CronDecoder[] = [
  [
    /^\*\/([1-9]\d*) \* \* \* \*$/,
    (m) => ({ frequency: "custom", customUnit: "minute", customInterval: Number(m[1]) }),
  ],
  [
    /^(\d+) \*\/(\d+) \* \* \*$/,
    (m) => ({
      frequency: "custom",
      minute: Number(m[1]),
      customUnit: "hourly",
      customInterval: Math.max(1, Number(m[2])),
    }),
  ],
  [
    /^(\d+) (\d+) \*\/(\d+) \* \*$/,
    (m) => ({
      frequency: "custom",
      ...decodedTime(m),
      customUnit: "daily",
      customInterval: Math.max(1, Number(m[3])),
    }),
  ],
  [/^(\d+) \* \* \* \*$/, (m) => ({ frequency: "hourly", minute: Number(m[1]) })],
  [/^(\d+) (\d+) \* \* \*$/, (m) => ({ frequency: "daily", ...decodedTime(m) })],
  [/^(\d+) (\d+) \* \* 1-5$/, (m) => ({ frequency: "weekdays", ...decodedTime(m) })],
  [
    /^(\d+) (\d+) \* \* (\S+)$/,
    (m) => {
      if (m[3] === "*") return null;
      // 历史 comma list 接受 Number 转换及空项的 0；保留而非新增严格数字过滤。
      const weekdays = m[3]!
        .split(",")
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
      return weekdays.length ? { frequency: "weekly", ...decodedTime(m), weekdays } : null;
    },
  ],
  [
    /^(\d+) (\d+) (\d+) (\d+) \*$/,
    (m) => {
      const month = Number(m[4]);
      return month >= 1 && month <= 12
        ? {
            frequency: "custom",
            ...decodedTime(m),
            customUnit: "yearly",
            customMonth: month,
            customMonthDays: [Number(m[3])],
          }
        : null;
    },
  ],
  [
    /^(\d+) (\d+) (\d+) \* \*$/,
    (m) => ({ frequency: "monthly", ...decodedTime(m), dayOfMonth: Number(m[3]) }),
  ],
];

export function parseCronToBuilder(expr: string): CronBuilderState {
  const fallback = defaultCronBuilder(expr);
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return fallback;
  const normalized = fields.join(" ");
  for (const [syntax, decode] of cronDecoders) {
    const match = syntax.exec(normalized);
    if (!match) continue;
    const decoded = decode(match);
    if (decoded) return { ...fallback, ...decoded };
  }
  return fallback;
}

const weekdayLabel = (day: number, intl: IntlLike): string =>
  intl.formatMessage({ id: `automations.weekday.${day}` });

type DescriptionRule = readonly [
  id: string,
  values: (state: CronBuilderState, intl: IntlLike) => Record<string, string>,
];
const clockLabel = (state: CronBuilderState) => `${pad2(state.hour)}:${pad2(state.minute)}`;
const atTime = (state: CronBuilderState, values: Record<string, string> = {}) => ({
  ...values,
  time: clockLabel(state),
});
const customAtTime = (state: CronBuilderState, values: Record<string, string> = {}) =>
  atTime(state, { interval: String(state.customInterval), ...values });
const weekdayOrder: readonly number[] = WEEKDAY_ORDER;
const fixedDescriptions = new Map<CronFrequency, DescriptionRule>([
  ["hourly", ["automations.schedule.hourly", (state) => ({ minute: pad2(state.minute) })]],
  ["daily", ["automations.schedule.daily", (state) => atTime(state)]],
  ["weekdays", ["automations.schedule.weekdays", (state) => atTime(state)]],
  [
    "weekly",
    [
      "automations.schedule.weekly",
      (state, intl) =>
        atTime(state, {
          days: [...state.weekdays]
            .sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b))
            .map((day) => weekdayLabel(day, intl))
            .join("、"),
        }),
    ],
  ],
  [
    "monthly",
    ["automations.schedule.monthly", (state) => atTime(state, { day: String(state.dayOfMonth) })],
  ],
]);
const dailyDescription: DescriptionRule = [
  "automations.schedule.custom",
  (state, intl) =>
    customAtTime(state, {
      unit: intl.formatMessage({ id: "automations.customRepeat.unit.day" }),
    }),
];
const customDescriptions = new Map<CustomRepeatUnit, DescriptionRule>([
  [
    "minute",
    ["automations.schedule.customMinutes", (state) => ({ interval: String(state.customInterval) })],
  ],
  [
    "hourly",
    [
      "automations.schedule.customHourly",
      (state) => ({ interval: String(state.customInterval), time: pad2(state.minute) }),
    ],
  ],
  ["daily", dailyDescription],
  [
    "weekly",
    [
      "automations.schedule.customWeekly",
      (state, intl) =>
        customAtTime(state, {
          days: state.customWeekdays
            .map((day) => weekdayLabel(day, intl))
            .join(intl.formatMessage({ id: "automations.weekday.separator" })),
        }),
    ],
  ],
  [
    "monthly",
    [
      "automations.schedule.customMonthlyDates",
      (state) => customAtTime(state, { days: state.customMonthDays.join(", ") }),
    ],
  ],
  [
    "yearly",
    [
      "automations.schedule.customYearly",
      (state) =>
        customAtTime(state, {
          month: String(state.customMonth),
          day: String(state.customMonthDays[0] ?? 1),
        }),
    ],
  ],
]);
const monthlyWeekdayDescription: DescriptionRule = [
  "automations.schedule.customMonthlyWeekday",
  (state, intl) =>
    customAtTime(state, {
      day: weekdayLabel(state.customWeekdays[0] ?? 1, intl),
    }),
];

/** 单一 descriptor projection 决定消息/参数；原 Intl owner 继续格式化。 */
export function describeCronBuilder(state: CronBuilderState, intl: IntlLike): string {
  const rule =
    state.frequency !== "custom"
      ? fixedDescriptions.get(state.frequency)
      : state.customUnit === "monthly" && state.customMonthlyMode === "weekday"
        ? monthlyWeekdayDescription
        : (customDescriptions.get(state.customUnit) ?? dailyDescription);
  if (!rule) return state.rawExpr;
  const [id, projectValues] = rule;
  return intl.formatMessage({ id }, projectValues(state, intl));
}

const normalizeCron = (expr: string) => expr.trim().replace(/\s+/g, " ");
// 固定月日和 month step 不携带单次/年度及真实间隔的产品语义。
const hasAmbiguousCalendarMeaning = (normalized: string): boolean =>
  /^\d+ \d+ \d+ \d+ \*$/.test(normalized) || /^\d+ \d+ \d+ \*\/\d+ \*$/.test(normalized);
function cronRoundtrip(normalized: string): { builder: CronBuilderState; exact: boolean } {
  const builder = parseCronToBuilder(normalized);
  return { builder, exact: buildCronExpr(builder) === normalized };
}

export function describeCron(expr: string, intl: IntlLike): string {
  const normalized = normalizeCron(expr);
  const minuteStep = /^\*\/([1-9]\d*) \* \* \* \*$/.exec(normalized);
  if (minuteStep) {
    // 原字符串避免超大步长经过 Number 后失去呈现精度。
    return intl.formatMessage(
      { id: "automations.schedule.customMinutes" },
      { interval: minuteStep[1]! },
    );
  }
  if (hasAmbiguousCalendarMeaning(normalized))
    return intl.formatMessage({ id: "automations.frequency.custom" });
  const { builder, exact } = cronRoundtrip(normalized);
  // 标准频率沿用旧的宽容呈现；未知 custom 不得把默认 09:00 当成真实调度。
  if (builder.frequency === "custom" && !exact)
    return intl.formatMessage({ id: "automations.frequency.custom" });
  return describeCronBuilder(builder, intl);
}

export function canVisualizeCronInAutomationEditor(expr: string): boolean {
  const normalized = normalizeCron(expr);
  return !hasAmbiguousCalendarMeaning(normalized) && cronRoundtrip(normalized).exact;
}

/** 本地时区偏移 → GMT 文案；支持 GMT+8 与 GMT+5:30 这类半小时时区。 */
export function formatGmtOffset(offsetMinutes = -new Date().getTimezoneOffset()): string {
  if (offsetMinutes === 0) return "GMT";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `GMT${sign}${hours}${minutes > 0 ? `:${pad2(minutes)}` : ""}`;
}

/** 毫秒时间戳 → 本地日期时间（YYYY-MM-DD HH:MM）。 */
export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 相对时间（如 “in 2h”“3d ago”），用于“下次运行 / 上次运行”。 */
export function formatRelativeToNow(ts: number | undefined, now: number, intl: IntlLike): string {
  if (!ts) return "-";
  const diff = ts - now;
  const abs = Math.abs(diff);
  const future = diff >= 0;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let value: number;
  let unitId: string;
  if (abs < minute) {
    return intl.formatMessage({
      id: future ? "automations.time.soon" : "automations.time.justNow",
    });
  }
  if (abs < hour) {
    value = Math.round(abs / minute);
    unitId = "automations.time.minutes";
  } else if (abs < day) {
    value = Math.round(abs / hour);
    unitId = "automations.time.hours";
  } else {
    value = Math.round(abs / day);
    unitId = "automations.time.days";
  }
  const amount = intl.formatMessage({ id: unitId }, { value: String(value) });
  return intl.formatMessage(
    { id: future ? "automations.time.in" : "automations.time.ago" },
    { amount },
  );
}

/** 定时任务卡片下次运行时间：过期不展示；一个月内相对时间，更远的未来绝对时间。 */
export function formatAutomationCardNextRun(
  ts: number | undefined,
  now: number,
  intl: IntlLike,
): string | null {
  if (!ts || ts <= now) return null;
  return ts - now <= AUTOMATION_CARD_RELATIVE_NEXT_RUN_THRESHOLD_MS
    ? formatRelativeToNow(ts, now, intl)
    : formatDateTime(ts);
}

/** 运行时长（毫秒）→ 可读文本（如 “1m 20s”“3s”）。 */
export function formatDuration(startTs: number | undefined, endTs: number | undefined): string {
  if (!startTs || !endTs || endTs < startTs) return "-";
  const totalSec = Math.round((endTs - startTs) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}
