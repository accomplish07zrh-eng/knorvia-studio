// SPDX-License-Identifier: MIT
// Observable allocation regression for the specified daily calendar search improvement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.KNORVIA_AUTOMATION_CONTRACT_ROOT;
const target = process.env.KNORVIA_AUTOMATION_CONTRACT_TARGET ?? "src";
const folder = root ? pathToFileURL(`${resolve(root)}/`) : new URL("../", import.meta.url);
const { computeScheduleRuleNextRunAt }: typeof import("../src/session/automationCron.js") =
  await import(
    new URL(`${target}/session/automationCron.${target === "src" ? "ts" : "js"}`, folder).href
  );

test("ordinary exhausted daily horizon uses at most 40 Date constructions", () => {
  const NativeDate = Date;
  const input = {
    unit: "daily" as const,
    interval: 1,
    hour: 9,
    minute: 30,
    anchorAt: Date.parse("2026-01-07T10:23:45.123Z"),
  };
  const from = Date.parse("2200-01-01T00:00:00Z");
  let constructions = 0;
  globalThis.Date = new Proxy(NativeDate, {
    construct(type, args) {
      constructions++;
      return Reflect.construct(type, args);
    },
  });
  try {
    assert.equal(computeScheduleRuleNextRunAt(input, from), null);
    assert.ok(
      constructions <= 40,
      `daily horizon constructed ${constructions} dates; budget is 40`,
    );
  } finally {
    globalThis.Date = NativeDate;
  }
});
