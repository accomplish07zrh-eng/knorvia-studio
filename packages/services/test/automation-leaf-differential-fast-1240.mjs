// SPDX-License-Identifier: MIT
// Synthetic comparison harness. Inputs are generated independently of the candidate algorithm.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [oldRoot, oldTarget, newRoot, newTarget] = process.argv.slice(2);
assert.ok(
  oldRoot && newRoot && oldTarget && newTarget,
  "oldRoot oldTarget newRoot newTarget required",
);
const load = (root, target, name) =>
  import(
    pathToFileURL(resolve(root, target, "session", `${name}.${target === "src" ? "ts" : "js"}`))
      .href
  );
const oldCron = await load(oldRoot, oldTarget, "automationCron");
const newCron = await load(newRoot, newTarget, "automationCron");
const oldRule = await load(oldRoot, oldTarget, "automationValidation");
const newRule = await load(newRoot, newTarget, "automationValidation");
const oldCarrier = await load(oldRoot, oldTarget, "automationIntervalCarrier");
const newCarrier = await load(newRoot, newTarget, "automationIntervalCarrier");
const observe = (fn, ...args) => {
  try {
    return { value: fn(...args) };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
};
const compare = (oldFn, newFn, ...args) => {
  const before = structuredClone(args);
  const expected = observe(oldFn, ...args);
  const actual = observe(newFn, ...args);
  assert.deepEqual(actual, expected, JSON.stringify(args));
  assert.deepEqual(args, before);
  return actual;
};
const initialTZ = process.env.TZ;
let comparisons = 0;
let roundTrips = 0;
try {
  for (const timezone of ["UTC", "America/New_York", "Pacific/Apia"]) {
    process.env.TZ = timezone;
    for (const anchor of [
      Date.parse("2026-01-07T10:23:45.123Z"),
      Date.parse("2026-03-07T17:00:00Z"),
      Date.parse("2011-12-29T10:00:00Z"),
    ]) {
      for (const unit of ["minute", "hourly", "daily", "weekly", "monthly", "yearly", "invalid"]) {
        for (const interval of [0, 1, 2.7, 13, 200, 1200, NaN, Infinity]) {
          const rule = {
            unit,
            interval,
            hour: 2,
            minute: 30,
            weekdays: [0, 3, 1, 3],
            monthDays: [31, 10, 29],
            months: [2, 12],
            monthlyMode: interval === 13 ? "weekday" : "date",
            anchorAt: anchor,
          };
          for (const from of [anchor - 86400000, anchor, anchor + 86400000 * 60]) {
            compare(
              oldCron.computeScheduleRuleNextRunAt,
              newCron.computeScheduleRuleNextRunAt,
              rule,
              from,
            );
            comparisons++;
          }
          compare(
            oldRule.assertValidAutomationScheduleRule,
            newRule.assertValidAutomationScheduleRule,
            rule,
          );
          compare(oldCron.scheduleRuleDefinition, newCron.scheduleRuleDefinition, rule);
          comparisons += 2;
        }
      }
    }
    for (const unit of ["minute", "hourly", "daily", "weekly", "monthly", "yearly", "invalid"]) {
      for (const expression of [
        "* * * * *",
        "5 9 1,31 2,12 0,1",
        "0 9",
        "? ? 2,,x */2 * ignored",
        "1e1 0x10 * * *",
      ]) {
        compare(
          oldCron.buildIntervalScheduleRule,
          newCron.buildIntervalScheduleRule,
          unit,
          50,
          expression,
          1767781425123,
        );
        comparisons++;
      }
    }
    for (const intervalUnit of [undefined, "daily", "invalid", null]) {
      for (const interval of [undefined, 0, 1, 200, 201, NaN, null]) {
        for (const extra of [
          {},
          { scheduleRule: null },
          { recurring: false },
          { maxRuns: NaN },
          { relativeDelayMinutes: 3 },
        ]) {
          compare(
            oldCarrier.assertValidAutomationIntervalCarrier,
            newCarrier.assertValidAutomationIntervalCarrier,
            { intervalUnit, interval, ...extra },
          );
          comparisons++;
        }
      }
    }
    for (const unit of ["minute", "hourly", "daily", "weekly", "monthly", "yearly"]) {
      const original = oldCron.buildIntervalScheduleRule(
        unit,
        40,
        "30 9 1,29 2,12 0,1",
        1767781425123,
      );
      const stored = JSON.stringify(original);
      const loadedByNew = JSON.parse(stored);
      newRule.assertValidAutomationScheduleRule(loadedByNew);
      assert.equal(JSON.stringify(loadedByNew), stored);
      const reloadedByOld = JSON.parse(JSON.stringify(loadedByNew));
      oldRule.assertValidAutomationScheduleRule(reloadedByOld);
      assert.equal(JSON.stringify(reloadedByOld), stored);
      compare(
        oldCron.computeAutomationNextRunAt,
        newCron.computeAutomationNextRunAt,
        { cronExpr: "30 9 1,29 2,12 0,1", scheduleRule: reloadedByOld },
        1767781425123,
      );
      roundTrips++;
    }
  }
} finally {
  if (initialTZ === undefined) delete process.env.TZ;
  else process.env.TZ = initialTZ;
}
process.stdout.write(
  JSON.stringify({
    comparisons,
    roundTrips,
    timezones: ["UTC", "America/New_York", "Pacific/Apia"],
    result: "pass",
  }) + "\n",
);
