// SPDX-License-Identifier: MIT
// Contract fixtures authored for this batch; prior production-source exposure is disclosed in the spec.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { KnorviaAutomationScheduleRule } from "@knorvia/shared";

process.env.TZ = "UTC";
const root = process.env.KNORVIA_AUTOMATION_CONTRACT_ROOT;
const target = process.env.KNORVIA_AUTOMATION_CONTRACT_TARGET ?? "src";
const folder = root ? pathToFileURL(`${resolve(root)}/`) : new URL("../", import.meta.url);
const load = (name: string) =>
  import(new URL(`${target}/session/${name}.${target === "src" ? "ts" : "js"}`, folder).href);
const cron: typeof import("../src/session/automationCron.js") = await load("automationCron");
const validation: typeof import("../src/session/automationValidation.js") =
  await load("automationValidation");
const carrier: typeof import("../src/session/automationIntervalCarrier.js") = await load(
  "automationIntervalCarrier",
);
const { AutomationService }: typeof import("../src/session/automationService.js") =
  await load("automationService");
const at = (value: string) => Date.parse(value);
const anchor = at("2026-01-07T10:23:45.123Z");
const rule = (
  patch: Partial<KnorviaAutomationScheduleRule> = {},
): KnorviaAutomationScheduleRule => ({
  unit: "daily",
  interval: 1,
  hour: 9,
  minute: 30,
  anchorAt: anchor,
  ...patch,
});
const error = (name: string, message: string) => (value: unknown) => {
  assert.ok(value instanceof Error);
  assert.equal(value.name, name);
  assert.equal(value.message, message);
  return true;
};

test("definition serialization ignores anchors, retains duplicates and sorts copies", () => {
  const value = rule({ weekdays: [6, 0, 2, 2], monthDays: [31, 1, 10], months: [12, 2] });
  const before = structuredClone(value);
  assert.equal(
    cron.scheduleRuleDefinition(value),
    '["daily",1,9,30,[0,2,2,6],[1,10,31],[2,12],null]',
  );
  assert.equal(
    cron.scheduleRuleDefinition({ ...value, anchorAt: 0 }),
    cron.scheduleRuleDefinition(value),
  );
  assert.deepEqual(value, before);
  assert.equal(
    cron.scheduleRuleDefinition(rule({ interval: NaN, weekdays: [] })),
    '["daily",null,9,30,[],null,null,null]',
  );
});

for (const [expression, expected] of [
  ["0 9 * * *", true],
  ["*/10 * * * *", true],
  ["0 0 9 * * *", true],
  ["@daily", true],
  ["not cron", false],
  ["61 * * * *", false],
  ["", false],
  [null, false],
] as const) {
  test(`Cron adapter validity ${String(expression)}`, () => {
    assert.equal(cron.isValidCronExpr(expression as string), expected);
  });
}
test("Cron next run is strictly after from and parser failure propagates", () => {
  assert.equal(
    cron.computeNextRunAt("0 9 * * *", at("2026-01-07T09:00:00Z")),
    at("2026-01-08T09:00:00Z"),
  );
  assert.throws(() => cron.computeNextRunAt("not cron"), Error);
});
test("relative delay and minute inference preserve seconds, property order and permissive range", () => {
  assert.equal(
    JSON.stringify(cron.buildRelativeDelaySchedule(3, anchor)),
    `{"cronExpr":"26 10 7 1 *","scheduleRule":{"unit":"minute","interval":3,"hour":10,"minute":26,"anchorAt":${anchor}}}`,
  );
  assert.deepEqual(cron.inferMinuteIntervalScheduleRule("  */201 * * * * ", anchor), {
    unit: "minute",
    interval: 201,
    hour: 10,
    minute: 23,
    anchorAt: anchor,
  });
  for (const expression of [
    "*/0 * * * *",
    "*/01 * * * *",
    "*/2 * * * * *",
    "*/2 1 * * *",
    "2 * * * *",
  ]) {
    assert.equal(cron.inferMinuteIntervalScheduleRule(expression, anchor), undefined);
  }
});

const nextCases: Array<[string, Partial<KnorviaAutomationScheduleRule>, number, number | null]> = [
  ["minute anchor", { unit: "minute", interval: 10 }, anchor, anchor + 600000],
  ["minute before anchor", { unit: "minute", interval: 10 }, anchor - 1000000, anchor + 600000],
  ["minute exact occurrence", { unit: "minute", interval: 10 }, anchor + 600000, anchor + 1200000],
  ["minute delayed dispatch", { unit: "minute", interval: 10 }, anchor + 650000, anchor + 1200000],
  ["minute clamp", { unit: "minute", interval: -2 }, anchor, anchor + 60000],
  ["minute floor", { unit: "minute", interval: 2.9 }, anchor, anchor + 120000],
  [
    "hourly aligned first",
    { unit: "hourly", interval: 2, minute: 30 },
    anchor,
    at("2026-01-07T10:30:00Z"),
  ],
  [
    "hourly zero period",
    { unit: "hourly", interval: 2, minute: 10 },
    anchor - 3600000,
    at("2026-01-07T10:10:00Z"),
  ],
  [
    "hourly elapsed",
    { unit: "hourly", interval: 2, minute: 10 },
    anchor,
    at("2026-01-07T12:10:00Z"),
  ],
  ["daily future", {}, anchor, at("2026-01-08T09:30:00Z")],
  ["daily interval", { interval: 3 }, anchor, at("2026-01-10T09:30:00Z")],
  ["daily anchor allowed", {}, anchor - 86400000, at("2026-01-07T09:30:00Z")],
  [
    "weekly first visited Sunday",
    { unit: "weekly", weekdays: [1, 0, 3] },
    at("2026-01-05T00:00:00Z"),
    at("2026-01-11T09:30:00Z"),
  ],
  ["weekly fallback", { unit: "weekly", weekdays: [] }, anchor, at("2026-01-12T09:30:00Z")],
  [
    "weekly Monday cycle",
    { unit: "weekly", interval: 2, weekdays: [3] },
    anchor,
    at("2026-01-21T09:30:00Z"),
  ],
  [
    "monthly skip February overflow",
    { unit: "monthly", monthDays: [31] },
    at("2026-01-31T09:30:00Z"),
    at("2026-03-31T09:30:00Z"),
  ],
  [
    "monthly sorted dates",
    { unit: "monthly", monthDays: [25, 10, 10] },
    anchor,
    at("2026-01-10T09:30:00Z"),
  ],
  [
    "monthly first weekday",
    { unit: "monthly", monthlyMode: "weekday", weekdays: [0, 5] },
    anchor,
    at("2026-02-01T09:30:00Z"),
  ],
  [
    "monthly inclusive horizon",
    { unit: "monthly", interval: 1200, monthDays: [1] },
    anchor,
    at("2126-01-01T09:30:00Z"),
  ],
  ["monthly beyond horizon", { unit: "monthly", interval: 1201, monthDays: [1] }, anchor, null],
  [
    "yearly leap",
    { unit: "yearly", months: [2], monthDays: [29] },
    anchor,
    at("2028-02-29T09:30:00Z"),
  ],
  [
    "yearly first month/day only",
    { unit: "yearly", months: [13, 2], monthDays: [10, 11] },
    anchor,
    at("2026-01-10T09:30:00Z"),
  ],
  [
    "yearly wrap negative month",
    { unit: "yearly", months: [0], monthDays: [1] },
    anchor,
    at("2026-12-01T09:30:00Z"),
  ],
  ["yearly no valid day", { unit: "yearly", months: [2], monthDays: [30] }, anchor, null],
  [
    "unknown runtime unit uses yearly",
    { unit: "unknown" as "yearly" },
    anchor,
    at("2027-01-07T09:30:00Z"),
  ],
  ["daily horizon exhausted", {}, at("2200-01-01T00:00:00Z"), null],
  ["weekly horizon exhausted", { unit: "weekly" }, at("2200-01-01T00:00:00Z"), null],
  ["yearly horizon exhausted", { unit: "yearly" }, at("2500-01-01T00:00:00Z"), null],
  ["invalid date", { anchorAt: NaN }, anchor, null],
  ["nonfinite daily interval", { interval: NaN }, anchor, null],
];
for (const [name, patch, from, expected] of nextCases) {
  test(`next occurrence: ${name}`, () => {
    const value = rule(patch);
    const before = structuredClone(value);
    assert.equal(cron.computeScheduleRuleNextRunAt(value, from), expected);
    assert.deepEqual(value, before);
  });
}
test("nonfinite elapsed schedules retain NaN, rule precedence bypasses invalid cron", () => {
  assert.equal(
    cron.computeScheduleRuleNextRunAt(rule({ unit: "minute", interval: Infinity }), anchor),
    Infinity,
  );
  assert.ok(
    Number.isNaN(
      cron.computeScheduleRuleNextRunAt(rule({ unit: "minute", interval: NaN }), anchor),
    ),
  );
  assert.equal(
    cron.computeAutomationNextRunAt({ cronExpr: "bad", scheduleRule: rule() }, anchor),
    at("2026-01-08T09:30:00Z"),
  );
});
for (const age of [0, 59999, 60000, 1800000, 1800001]) {
  test(`one-shot stale target age ${age}`, () => {
    const targetAt = at("2026-01-07T10:00:00Z");
    const from = targetAt + age;
    const input = { cronExpr: "0 10 7 1 *", recurring: false };
    if (age >= 60000 && age <= 1800000) {
      assert.throws(
        () => cron.computeInitialAutomationNextRunAt(input, from),
        error(
          "StaleOneShotAutomationScheduleError",
          `一次性定时任务的目标时间（${new Date(targetAt).toLocaleString()}）已过去；相对时间请使用 delayMinutes，绝对时间请确认未来时刻后重试`,
        ),
      );
    } else
      assert.equal(
        cron.computeInitialAutomationNextRunAt(input, from),
        age > 0 && age < 60000 ? from : at("2027-01-07T10:00:00Z"),
      );
    assert.equal(
      cron.computeInitialAutomationNextRunAt({ ...input, recurring: true }, from),
      at("2027-01-07T10:00:00Z"),
    );
  });
}
test("one-shot classification is independent of run schedule", () => {
  for (const [maxRuns, expected] of [
    [undefined, true],
    [null, true],
    [0, true],
    [1, true],
    [2, false],
    [NaN, false],
  ] as const) {
    assert.equal(
      cron.isOneShotAutomation({ recurring: false, maxRuns: maxRuns as number }),
      expected,
    );
    assert.equal(cron.isOneShotAutomation({ recurring: true, maxRuns: maxRuns as number }), false);
  }
});

for (const unit of ["minute", "hourly", "daily", "weekly", "monthly", "yearly"] as const) {
  test(`carrier projection ${unit} retains JSON keys`, () => {
    const extras =
      unit === "weekly"
        ? { weekdays: [5, 1] }
        : unit === "monthly"
          ? { monthDays: [31, 2], monthlyMode: "date" }
          : unit === "yearly"
            ? { months: [12, 2], monthDays: [31, 2] }
            : {};
    const expected = {
      unit,
      interval: 50,
      hour: unit === "minute" ? 10 : unit === "hourly" ? 0 : 4,
      minute: unit === "minute" ? 23 : 5,
      ...extras,
      anchorAt: anchor,
    };
    assert.equal(
      JSON.stringify(cron.buildIntervalScheduleRule(unit, 50, "5 4 31,2 12,2 5,1", anchor)),
      JSON.stringify(expected),
    );
  });
}
test("carrier parsing defaults, extra tokens, malformed lists and unsupported unit", () => {
  assert.deepEqual(cron.buildIntervalScheduleRule("yearly", 2, "0 9", anchor), {
    unit: "yearly",
    interval: 2,
    hour: 10,
    minute: 23,
    months: [1],
    monthDays: [7],
    anchorAt: anchor,
  });
  assert.deepEqual(cron.buildIntervalScheduleRule("yearly", 2, "? ? 2,,x */2 * ignored", anchor), {
    unit: "yearly",
    interval: 2,
    hour: 10,
    minute: 23,
    months: [1],
    monthDays: [2, 0],
    anchorAt: anchor,
  });
  assert.throws(
    () => cron.buildIntervalScheduleRule("bad" as "daily", 1, "* * * * *", anchor),
    error("Error", "Unsupported intervalUnit: bad"),
  );
});

const carrierErrors: Array<[object, string]> = [
  [{ interval: 0 }, "intervalUnit 与 interval 必须同时提交或同时省略"],
  [{ intervalUnit: "daily" }, "intervalUnit 与 interval 必须同时提交或同时省略"],
  ...[0, 201, 1.5, NaN, Infinity, null].map(
    (interval) =>
      [{ intervalUnit: "daily", interval }, "interval 必须是 1-200 的整数"] as [object, string],
  ),
  [
    { intervalUnit: "daily", interval: 1, relativeDelayMinutes: 0, scheduleRule: null },
    "intervalUnit 是周期 carrier，不能与一次性 relativeDelayMinutes 同时提交",
  ],
  [
    { intervalUnit: "daily", interval: 1, scheduleRule: null, recurring: false },
    "intervalUnit carrier 不能与直传 scheduleRule 同时提交",
  ],
  [
    { intervalUnit: "daily", interval: 1, recurring: false, maxRuns: 1 },
    "intervalUnit carrier 必须使用 recurring=true",
  ],
  ...[0, NaN, Infinity].map(
    (maxRuns) =>
      [
        { intervalUnit: "daily", interval: 1, maxRuns },
        "intervalUnit carrier 不能与有限 maxRuns 同时提交",
      ] as [object, string],
  ),
];
for (const [index, [input, message]] of carrierErrors.entries()) {
  test(`carrier rejection and precedence ${index}`, () => {
    assert.throws(
      () => carrier.assertValidAutomationIntervalCarrier(input),
      error("InvalidAutomationIntervalCarrierError", `非法的自定义重复入参：${message}`),
    );
  });
}
test("carrier omission, uncapped unit membership and shallow recurring projection", () => {
  for (const input of [
    {},
    { maxRuns: 1, recurring: false },
    { intervalUnit: "bad", interval: 200, maxRuns: null },
  ]) {
    assert.doesNotThrow(() => carrier.assertValidAutomationIntervalCarrier(input as never));
  }
  const nested = {};
  const input = { recurring: false, maxRuns: 3, title: "x", nested };
  const result = carrier.forceIntervalCarrierRecurring(input);
  assert.notEqual(result, input);
  assert.equal((result as typeof input).nested, nested);
  assert.equal(JSON.stringify(result), '{"recurring":true,"maxRuns":null,"title":"x","nested":{}}');
  assert.equal(input.recurring, false);
});

const ruleErrors: Array<[object, string]> = [
  [{ unit: "bad", interval: 0 }, "unit 不受支持"],
  ...[0, 1.1, Infinity, NaN].map(
    (interval) => [{ interval, hour: 24 }, "interval 必须是正整数"] as [object, string],
  ),
  [{ unit: "monthly", interval: 1201, hour: 24 }, "monthly interval 不能超过 1200"],
  [{ hour: 24, minute: 60 }, "hour 必须是 0-23 的整数"],
  [{ minute: 60, monthlyMode: "bad" }, "minute 必须是 0-59 的整数"],
  [{ monthlyMode: "bad", weekdays: [] }, "monthlyMode 不受支持"],
  [{ weekdays: [] }, "weekdays 必须是 0-6 的非空整数数组"],
  [{ unit: "weekly" }, "weekly 规则必须包含有效的 weekdays"],
  [
    { unit: "monthly", monthlyMode: "weekday", monthDays: [32] },
    "monthly weekday 规则必须包含有效的 weekdays",
  ],
  [{ unit: "monthly", months: [13] }, "monthly date 规则必须包含有效的 monthDays"],
  [{ months: [0], monthDays: [32] }, "months 必须是 1-12 的非空整数数组"],
  [{ monthDays: [32] }, "monthDays 必须是 1-31 的非空整数数组"],
];
for (const [index, [patch, message]] of ruleErrors.entries()) {
  test(`rule rejection and precedence ${index}`, () => {
    assert.throws(
      () => validation.assertValidAutomationScheduleRule(rule(patch)),
      error("InvalidAutomationScheduleRuleError", `非法的定时任务调度规则：${message}`),
    );
  });
}
test("rule validator retains sparse arrays, invalid list native error, uncapped intervals and no anchor validation", () => {
  const sparse: number[] = [];
  sparse.length = 3;
  assert.doesNotThrow(() =>
    validation.assertValidAutomationScheduleRule(
      rule({ unit: "weekly", weekdays: sparse, anchorAt: NaN, interval: 999999 }),
    ),
  );
  assert.doesNotThrow(() =>
    validation.assertValidAutomationScheduleRule(
      rule({ unit: "monthly", interval: 1200, monthDays: [1, 31] }),
    ),
  );
  assert.throws(
    () =>
      validation.assertValidAutomationScheduleRule(rule({ weekdays: { length: 1 } as number[] })),
    TypeError,
  );
});
test("public error constructors preserve names and default messages", () => {
  assert.equal(new validation.InvalidCronExprError("bad").message, "非法的 cron 表达式：bad");
  assert.equal(
    new validation.InvalidAutomationMaxRunsUpdateError().message,
    "清空 maxRuns 时必须在同一次更新中设置 recurring=true",
  );
  assert.equal(
    new validation.InvalidAutomationMaxRunsUpdateError("custom").name,
    "InvalidAutomationMaxRunsUpdateError",
  );
  assert.equal(
    new validation.InvalidAutomationRelativeDelayError("custom").message,
    "非法的相对时间定时任务：custom",
  );
});

test("local calendar DST gap, fold and elapsed hourly semantics", () => {
  process.env.TZ = "America/New_York";
  try {
    const spring = rule({ anchorAt: at("2026-03-07T12:00:00-05:00"), hour: 2, minute: 30 });
    assert.equal(
      cron.computeScheduleRuleNextRunAt(spring, at("2026-03-08T00:00:00-05:00")),
      at("2026-03-08T03:30:00-04:00"),
    );
    const fall = rule({ anchorAt: at("2026-10-31T12:00:00-04:00"), hour: 1, minute: 30 });
    assert.equal(
      cron.computeScheduleRuleNextRunAt(fall, at("2026-11-01T01:45:00-04:00")),
      at("2026-11-02T01:30:00-05:00"),
    );
    const hourly = rule({ unit: "hourly", anchorAt: at("2026-11-01T00:00:00-04:00"), minute: 30 });
    assert.equal(
      cron.computeScheduleRuleNextRunAt(hourly, at("2026-11-01T01:45:00-04:00")),
      at("2026-11-01T01:30:00-05:00"),
    );
  } finally {
    process.env.TZ = "UTC";
  }
});

function serviceFixture(t: { after: (fn: () => void) => void }) {
  const clock = Date.now;
  Date.now = () => anchor;
  t.after(() => {
    Date.now = clock;
  });
  const calls: unknown[][] = [];
  const existing = {
    automationId: "test",
    cronExpr: "0 9 * * *",
    workspacePath: "/synthetic",
    workspaceKey: "/synthetic",
    recurring: false,
    maxRuns: 2,
    lifecycleStatus: "active",
    scheduleRule: rule({ unit: "minute", interval: 10 }),
  };
  const repo = {
    create: async (...args: unknown[]) => {
      calls.push(args);
      return args[0];
    },
    get: async () => existing,
    getScheduledRunCount: async () => 0,
    update: async (...args: unknown[]) => {
      calls.push(args);
      return args[1];
    },
  };
  return { service: new AutomationService(repo as never), calls, existing };
}
const params = {
  title: "Synthetic",
  cronExpr: "* * * * *",
  prompt: "Synthetic",
  workspacePath: "/synthetic",
  recurring: false,
};
test("real AutomationService create captures clock once and removes carrier transport fields", async (t) => {
  const { service, calls } = serviceFixture(t);
  await service.create({ ...params, intervalUnit: "hourly", interval: 50, recurring: true });
  assert.deepEqual(calls, [
    [
      {
        ...params,
        recurring: true,
        maxRuns: undefined,
        scheduleRule: { unit: "hourly", interval: 50, hour: 0, minute: 23, anchorAt: anchor },
      },
      { nextRunAt: at("2026-01-09T12:23:00Z") },
    ],
  ]);
});
test("real AutomationService rejected carrier performs no persistence", async (t) => {
  const { service, calls } = serviceFixture(t);
  await assert.rejects(
    service.create({ ...params, intervalUnit: "daily", interval: 1 }),
    /recurring=true/,
  );
  assert.deepEqual(calls, []);
});
test("real AutomationService relative delay preserves exact target and end bound", async (t) => {
  const { service, calls } = serviceFixture(t);
  await service.create({ ...params, relativeDelayMinutes: 3, endAt: anchor + 60000 });
  assert.deepEqual(calls[0]?.[1], { nextRunAt: null, lifecycleStatus: "completed" });
  assert.deepEqual((calls[0]![0] as { scheduleRule: unknown }).scheduleRule, {
    unit: "minute",
    interval: 3,
    hour: 10,
    minute: 26,
    anchorAt: anchor,
  });
});
test("real AutomationService carrier update atomically changes recurrence and clears cap", async (t) => {
  const { service, calls } = serviceFixture(t);
  await service.update("test", { intervalUnit: "daily", interval: 40 });
  assert.deepEqual(calls, [
    [
      "test",
      {
        recurring: true,
        maxRuns: null,
        scheduleRule: { unit: "daily", interval: 40, hour: 9, minute: 0, anchorAt: anchor },
      },
      { nextRunAt: at("2026-02-16T09:00:00Z"), resetRetry: true },
      undefined,
    ],
  ]);
});
test("real AutomationService explicit null clears schedule, unchanged definition keeps original anchor", async (t) => {
  const { service, calls, existing } = serviceFixture(t);
  await service.update("test", { scheduleRule: null });
  assert.deepEqual(calls[0]?.[1], { scheduleRule: null });
  existing.scheduleRule.anchorAt = anchor - 60000;
  await service.update("test", {
    scheduleRule: rule({ unit: "minute", interval: 10, anchorAt: 0 }),
  });
  assert.equal(
    (calls[1]![1] as { scheduleRule: KnorviaAutomationScheduleRule }).scheduleRule.anchorAt,
    anchor - 60000,
  );
});
