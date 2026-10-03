// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCronExpr,
  parseCronToBuilder,
  describeCronBuilder,
  describeCron,
  canVisualizeCronInAutomationEditor,
  type CronBuilderState,
  type IntlLike,
} from "../src/settings/automationFormat.js";
const intl: IntlLike = {
  formatMessage: ({ id }, values) => (values ? JSON.stringify({ id, values }) : id),
};
const base = (): CronBuilderState => ({
  ...parseCronToBuilder("0 9 * * *"),
  hour: 9,
  minute: 5,
  weekdays: [0, 3, 1],
  dayOfMonth: 18,
  customInterval: 2,
  customWeekdays: [5, 1],
  customMonthDays: [2, 15],
  customMonth: 7,
});
const message = (state: CronBuilderState) => JSON.parse(describeCronBuilder(state, intl));

test("standard frequencies preserve cron ordering and avoid mutating weekday arrays", () => {
  const state = base();
  const cases = {
    hourly: "5 * * * *",
    daily: "5 9 * * *",
    weekdays: "5 9 * * 1-5",
    weekly: "5 9 * * 0,1,3",
    monthly: "5 9 18 * *",
  };
  for (const [frequency, expected] of Object.entries(cases))
    assert.equal(
      buildCronExpr({ ...state, frequency: frequency as CronBuilderState["frequency"] }),
      expected,
    );
  assert.deepEqual(state.weekdays, [0, 3, 1]);
  assert.equal(buildCronExpr({ ...state, frequency: "weekly", weekdays: [] }), "5 9 * * *");
});

test("custom intervals preserve legal compatibility candidates and scheduleRule boundaries", () => {
  const limits = {
    minute: [59, "*/59 * * * *", "* * * * *"],
    hourly: [24, "5 */24 * * *", "5 * * * *"],
    daily: [31, "5 9 */31 * *", "5 9 * * *"],
  } as const;
  for (const [customUnit, [limit, allowed, fallback]] of Object.entries(limits)) {
    const state = {
      ...base(),
      frequency: "custom" as const,
      customUnit: customUnit as CronBuilderState["customUnit"],
    };
    assert.equal(buildCronExpr({ ...state, customInterval: limit }), allowed);
    assert.equal(buildCronExpr({ ...state, customInterval: limit + 1 }), fallback);
    assert.equal(buildCronExpr({ ...state, customInterval: NaN }), fallback);
  }
  assert.equal(
    buildCronExpr({ ...base(), frequency: "custom", customUnit: "minute", customInterval: -2 }),
    "*/1 * * * *",
  );
  assert.equal(
    buildCronExpr({ ...base(), frequency: "custom", customUnit: "hourly", customInterval: 2.9 }),
    "5 */2 * * *",
  );
});

test("custom weekly, monthly date/weekday and yearly modes retain order and defaults", () => {
  const state = { ...base(), frequency: "custom" as const };
  assert.equal(buildCronExpr({ ...state, customUnit: "weekly" }), "5 9 * * 5,1");
  assert.equal(buildCronExpr({ ...state, customUnit: "weekly", customWeekdays: [] }), "5 9 * * 1");
  assert.equal(buildCronExpr({ ...state, customUnit: "monthly" }), "5 9 2,15 * *");
  assert.equal(
    buildCronExpr({ ...state, customUnit: "monthly", customMonthlyMode: "weekday" }),
    "5 9 * * 5#1",
  );
  assert.equal(buildCronExpr({ ...state, customUnit: "yearly" }), "5 9 2 7 *");
  assert.equal(buildCronExpr({ ...state, customUnit: "yearly", customMonth: 13.9 }), "5 9 2 12 *");
  assert.equal(buildCronExpr({ ...state, customUnit: "yearly", customMonth: 0 }), "5 9 2 1 *");
  assert.equal(
    buildCronExpr({ ...state, customUnit: "yearly", customMonthDays: [] }),
    `5 9 ${new Date().getDate()} 7 *`,
  );
});

test("ordered cron recognition preserves steps, numeric tolerance and unknown raw expressions", () => {
  const cases: Array<[string, Partial<CronBuilderState>]> = [
    ["*/3 * * * *", { frequency: "custom", customUnit: "minute", customInterval: 3 }],
    ["5 */0 * * *", { frequency: "custom", customUnit: "hourly", customInterval: 1, minute: 5 }],
    ["5 8 */0 * *", { frequency: "custom", customUnit: "daily", customInterval: 1, hour: 8 }],
    ["05 * * * *", { frequency: "hourly", minute: 5 }],
    ["5 8 * * *", { frequency: "daily", hour: 8, minute: 5 }],
    ["5 8 * * 1-5", { frequency: "weekdays" }],
    ["5 8 * * 5,,9,0x2,NaN", { frequency: "weekly", weekdays: [5, 0, 2] }],
    [
      "5 8 31 12 *",
      { frequency: "custom", customUnit: "yearly", customMonth: 12, customMonthDays: [31] },
    ],
    ["5 8 18 * *", { frequency: "monthly", dayOfMonth: 18 }],
  ];
  for (const [expr, expected] of cases) {
    const actual = parseCronToBuilder(expr);
    for (const [key, value] of Object.entries(expected))
      assert.deepEqual(actual[key as keyof CronBuilderState], value, expr + " " + key);
    assert.equal(actual.rawExpr, expr);
  }
  for (const expr of [
    "5 8 31 13 *",
    "5 8 * * 1#1",
    "  unknown expression ",
    "0 9 * * MON",
    "*/03 * * * *",
  ]) {
    const state = parseCronToBuilder(expr);
    assert.equal(state.frequency, "custom");
    assert.equal(state.rawExpr, expr);
    assert.equal(state.hour, 9);
    assert.equal(state.customUnit, "daily");
  }
});

test("schedule descriptions preserve original IDs, value shapes and human weekday order", () => {
  const state = base();
  assert.deepEqual(message({ ...state, frequency: "hourly" }), {
    id: "automations.schedule.hourly",
    values: { minute: "05" },
  });
  assert.deepEqual(message(state), { id: "automations.schedule.daily", values: { time: "09:05" } });
  assert.deepEqual(message({ ...state, frequency: "weekdays" }), {
    id: "automations.schedule.weekdays",
    values: { time: "09:05" },
  });
  assert.deepEqual(message({ ...state, frequency: "weekly" }), {
    id: "automations.schedule.weekly",
    values: {
      days: "automations.weekday.1、automations.weekday.3、automations.weekday.0",
      time: "09:05",
    },
  });
  assert.deepEqual(message({ ...state, frequency: "monthly" }), {
    id: "automations.schedule.monthly",
    values: { day: "18", time: "09:05" },
  });
});

test("custom descriptions retain minute-only hourly time and all locale parameters", () => {
  const state = { ...base(), frequency: "custom" as const };
  assert.deepEqual(message({ ...state, customUnit: "minute" }), {
    id: "automations.schedule.customMinutes",
    values: { interval: "2" },
  });
  assert.deepEqual(message({ ...state, customUnit: "hourly" }), {
    id: "automations.schedule.customHourly",
    values: { interval: "2", time: "05" },
  });
  assert.deepEqual(message({ ...state, customUnit: "daily" }), {
    id: "automations.schedule.custom",
    values: { interval: "2", unit: "automations.customRepeat.unit.day", time: "09:05" },
  });
  assert.deepEqual(message({ ...state, customUnit: "weekly" }), {
    id: "automations.schedule.customWeekly",
    values: {
      interval: "2",
      days: "automations.weekday.5automations.weekday.separatorautomations.weekday.1",
      time: "09:05",
    },
  });
  assert.deepEqual(message({ ...state, customUnit: "monthly" }), {
    id: "automations.schedule.customMonthlyDates",
    values: { interval: "2", days: "2, 15", time: "09:05" },
  });
  assert.deepEqual(message({ ...state, customUnit: "monthly", customMonthlyMode: "weekday" }), {
    id: "automations.schedule.customMonthlyWeekday",
    values: { interval: "2", day: "automations.weekday.5", time: "09:05" },
  });
  assert.deepEqual(message({ ...state, customUnit: "yearly" }), {
    id: "automations.schedule.customYearly",
    values: { interval: "2", month: "7", day: "2", time: "09:05" },
  });
});

test("card and editor preserve ambiguity and exact-normalized-roundtrip boundaries", () => {
  for (const expr of ["5 9 10 4 *", "5 9 10 */2 *", "unknown cron", "5 9 * * MON", "5 */0 * * *"]) {
    assert.equal(describeCron(expr, intl), "automations.frequency.custom");
    assert.equal(canVisualizeCronInAutomationEditor(expr), false);
  }
  assert.deepEqual(JSON.parse(describeCron("  0   9 * * * ", intl)), {
    id: "automations.schedule.daily",
    values: { time: "09:00" },
  });
  assert.equal(canVisualizeCronInAutomationEditor(" 0 9 * * * "), true);
  assert.equal(canVisualizeCronInAutomationEditor("00 * * * *"), false);
  assert.deepEqual(JSON.parse(describeCron("00 * * * *", intl)), {
    id: "automations.schedule.hourly",
    values: { minute: "00" },
  });
  const interval = "123456789012345678901234567890";
  assert.deepEqual(JSON.parse(describeCron(`*/${interval} * * * *`, intl)), {
    id: "automations.schedule.customMinutes",
    values: { interval },
  });
});
