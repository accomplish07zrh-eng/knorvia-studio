// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 旧实现 d216b46 的固定期望；先在 98ad2bc 上复现负年份跨入 year 0..99 的回退。
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { KnorviaAutomationScheduleRule } from "@knorvia/shared";

const root = process.env.KNORVIA_AUTOMATION_YEAR_REGRESSION_ROOT;
const target = process.env.KNORVIA_AUTOMATION_YEAR_REGRESSION_TARGET ?? "src";
const folder = root ? pathToFileURL(`${resolve(root)}/`) : new URL("../", import.meta.url);
const load = (name: string) =>
  import(new URL(`${target}/session/${name}.${target === "src" ? "ts" : "js"}`, folder).href);
const cron: typeof import("../src/session/automationCron.js") = await load("automationCron");
const validation: typeof import("../src/session/automationValidation.js") =
  await load("automationValidation");

interface MonthlyCase {
  name: string;
  anchor: string;
  expected: string;
  timezone?: string;
  from?: string;
  interval?: number;
  hour?: number;
  minute?: number;
  weekdays?: number[];
  monthDays?: number[];
}

function inTimezone(timezone: string, check: () => void): void {
  const original = process.env.TZ;
  process.env.TZ = timezone;
  try {
    check();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

const cases: MonthlyCase[] = [
  {
    name: "negative anchor crosses year 0 to Monday",
    anchor: "-000001-12-15T00:00:00Z",
    expected: "1900-01-01T00:00:00Z",
  },
  {
    name: "negative anchor crosses year 0 to Sunday",
    anchor: "-000001-12-15T00:00:00Z",
    weekdays: [0],
    expected: "1900-01-07T00:00:00Z",
  },
  {
    name: "negative anchor crosses year 0 to Wednesday",
    anchor: "-000001-12-15T00:00:00Z",
    weekdays: [3],
    expected: "1900-01-03T00:00:00Z",
  },
  {
    name: "negative anchor crosses year 0 to Saturday",
    anchor: "-000001-12-15T00:00:00Z",
    weekdays: [6],
    expected: "1900-01-06T00:00:00Z",
  },
  {
    name: "13 months cross into year 1",
    anchor: "-000001-12-15T00:00:00Z",
    interval: 13,
    expected: "1901-01-07T00:00:00Z",
  },
  {
    name: "25 months cross from year -2 into year 1",
    anchor: "-000002-12-15T00:00:00Z",
    interval: 25,
    expected: "1901-01-07T00:00:00Z",
  },
  {
    name: "inclusive 1200 month offset crosses into year 99",
    anchor: "-000001-12-15T00:00:00Z",
    interval: 1200,
    expected: "1999-12-06T00:00:00Z",
  },
  {
    name: "direct year 0 retains initial Date normalization",
    anchor: "0000-12-15T00:00:00Z",
    expected: "1900-12-03T00:00:00Z",
  },
  {
    name: "direct year 99 retains initial Date normalization",
    anchor: "0099-12-15T00:00:00Z",
    expected: "1999-12-06T00:00:00Z",
  },
  {
    name: "year 100 does not normalize to 1900",
    anchor: "0100-12-15T00:00:00Z",
    expected: "0101-01-03T00:00:00Z",
  },
  {
    name: "ordinary next Monday",
    anchor: "2026-01-07T10:23:45.123Z",
    hour: 9,
    minute: 30,
    expected: "2026-02-02T09:30:00Z",
  },
  {
    name: "ordinary two month interval",
    anchor: "2026-01-07T10:23:45.123Z",
    interval: 2,
    hour: 9,
    minute: 30,
    expected: "2026-03-02T09:30:00Z",
  },
  {
    name: "ordinary inclusive 1200 month horizon",
    anchor: "2026-01-07T10:23:45.123Z",
    interval: 1200,
    hour: 9,
    minute: 30,
    expected: "2126-01-07T09:30:00Z",
  },
  {
    name: "strictly after an equal candidate",
    anchor: "2026-01-07T10:23:45.123Z",
    from: "2026-02-02T09:30:00Z",
    hour: 9,
    minute: 30,
    expected: "2026-03-02T09:30:00Z",
  },
  {
    name: "only the first supplied weekday is used",
    anchor: "2026-01-07T10:23:45.123Z",
    weekdays: [0, 5, 0],
    hour: 9,
    minute: 30,
    expected: "2026-02-01T09:30:00Z",
  },
  {
    name: "Lord Howe half-hour DST gap",
    timezone: "Australia/Lord_Howe",
    anchor: "2026-09-15T12:00:00+10:30",
    weekdays: [0],
    hour: 2,
    minute: 15,
    expected: "2026-10-03T15:45:00Z",
  },
  {
    name: "Lord Howe half-hour DST fold",
    timezone: "Australia/Lord_Howe",
    anchor: "2026-03-15T12:00:00+11:00",
    weekdays: [0],
    hour: 1,
    minute: 45,
    expected: "2026-04-04T14:45:00Z",
  },
  {
    name: "Santiago midnight DST gap",
    timezone: "America/Santiago",
    anchor: "2026-08-15T12:00:00-04:00",
    weekdays: [0],
    hour: 0,
    minute: 30,
    expected: "2026-09-06T04:30:00Z",
  },
  {
    name: "New York fold skips the passed first occurrence",
    timezone: "America/New_York",
    anchor: "2026-10-15T12:00:00-04:00",
    from: "2026-11-01T01:45:00-04:00",
    weekdays: [0],
    hour: 1,
    minute: 30,
    expected: "2026-12-06T06:30:00Z",
  },
  {
    name: "date mode skips February overflow",
    anchor: "2026-01-31T10:00:00Z",
    monthDays: [31],
    hour: 9,
    minute: 30,
    expected: "2026-03-31T09:30:00Z",
  },
  {
    name: "date mode sorts a copy and retains duplicates",
    anchor: "2026-01-31T10:00:00Z",
    monthDays: [31, 1, 31],
    hour: 9,
    minute: 30,
    expected: "2026-02-01T09:30:00Z",
  },
  {
    name: "date mode skips a whole-day month overflow",
    timezone: "Pacific/Kiritimati",
    anchor: "1994-12-15T12:00:00-10:00",
    monthDays: [31],
    hour: 9,
    minute: 30,
    expected: "1995-01-30T19:30:00Z",
  },
];

for (const fixture of cases) {
  test(`monthly normalization: ${fixture.name}`, () => {
    inTimezone(fixture.timezone ?? "UTC", () => {
      const rule: KnorviaAutomationScheduleRule = {
        unit: "monthly",
        interval: fixture.interval ?? 1,
        hour: fixture.hour ?? 0,
        minute: fixture.minute ?? 0,
        monthlyMode: fixture.monthDays ? "date" : "weekday",
        ...(fixture.monthDays
          ? { monthDays: fixture.monthDays }
          : { weekdays: fixture.weekdays ?? [1] }),
        anchorAt: Date.parse(fixture.anchor),
      };
      const snapshot = structuredClone(rule);
      // 低年份仍是合法旧输入；禁止通过收紧 validator 绕开日历投影回退。
      assert.doesNotThrow(() => validation.assertValidAutomationScheduleRule(rule));
      assert.equal(
        cron.computeScheduleRuleNextRunAt(rule, Date.parse(fixture.from ?? fixture.anchor)),
        Date.parse(fixture.expected),
      );
      assert.deepEqual(rule, snapshot);
    });
  });
}

test("monthly normalization: exhausted horizon and admission cap remain distinct", () => {
  inTimezone("UTC", () => {
    const rule: KnorviaAutomationScheduleRule = {
      unit: "monthly",
      interval: 1201,
      hour: 9,
      minute: 30,
      monthlyMode: "weekday",
      weekdays: [1],
      anchorAt: Date.parse("2026-01-07T10:23:45.123Z"),
    };
    assert.equal(cron.computeScheduleRuleNextRunAt(rule, rule.anchorAt), null);
    assert.throws(
      () => validation.assertValidAutomationScheduleRule(rule),
      /monthly interval 不能超过 1200/,
    );
  });
});
