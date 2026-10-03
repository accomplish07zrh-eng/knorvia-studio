// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOwnedRenameAttempts,
  type OwnedRenameAttempt,
} from "./creation-rename-attempts-fixture.js";
const first: OwnedRenameAttempt = {
  source: "jobs.json.owned.tmp",
  outcome: "injected",
  code: "EPERM",
};
const last: OwnedRenameAttempt = { source: first.source, outcome: "committed" };
test("one injected failure and one commit account for exactly two attempts", () => {
  assertOwnedRenameAttempts([first, last], 2);
});
for (const code of ["EPERM", "EACCES", "EBUSY"]) {
  test(`an additional observed native ${code} failure accounts for exactly three attempts`, () => {
    assertOwnedRenameAttempts(
      [first, { source: first.source, outcome: "native-failed", code }, last],
      3,
    );
  });
}
const invalid: Array<[string, OwnedRenameAttempt[], number]> = [
  ["unexplained count", [first, last], 3],
  ["extra successful write", [first, last, last], 3],
  ["different temporary transaction", [first, { ...last, source: "other.tmp" }], 2],
  [
    "unsupported native error",
    [first, { source: first.source, outcome: "native-failed", code: "EIO" }, last],
    3,
  ],
  ["unknown native error", [first, { source: first.source, outcome: "native-failed" }, last], 3],
  ["second injection", [first, first, last], 3],
  ["no injection", [last], 1],
  ["no committed attempt", [first], 1],
  ["commit not last", [last, first], 2],
  [
    "injection not first",
    [{ source: first.source, outcome: "native-failed", code: "EPERM" }, first, last],
    3,
  ],
  [
    "past existing retry bound",
    [
      first,
      ...Array.from({ length: 8 }, () => ({
        source: first.source,
        outcome: "native-failed" as const,
        code: "EPERM",
      })),
      last,
    ],
    10,
  ],
];
for (const [name, attempts, count] of invalid)
  test(`rejects ${name}`, () => assert.throws(() => assertOwnedRenameAttempts(attempts, count)));
test("nine attempts exactly is the existing bounded retry limit", () => {
  assertOwnedRenameAttempts(
    [
      first,
      ...Array.from({ length: 7 }, () => ({
        source: first.source,
        outcome: "native-failed" as const,
        code: "EBUSY",
      })),
      last,
    ],
    9,
  );
});
