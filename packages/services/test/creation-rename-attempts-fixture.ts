// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";

export interface OwnedRenameAttempt {
  source: string;
  outcome: "injected" | "native-failed" | "committed";
  code?: string;
}
const MAX_EXISTING_RENAME_ATTEMPTS = 9;
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

/** 原生 IO 可能另有瞬时失败；必须逐次解释，而不能把额外调用一概放行。 */
export function assertOwnedRenameAttempts(
  attempts: readonly OwnedRenameAttempt[],
  count: number,
): void {
  assert.equal(attempts.length, count, "every observed rename must have one recorded outcome");
  assert.ok(
    count >= 2 && count <= MAX_EXISTING_RENAME_ATTEMPTS,
    "retain the existing bounded retry contract",
  );
  assert.equal(
    new Set(attempts.map((attempt) => attempt.source)).size,
    1,
    "only one temporary-file transaction may commit",
  );
  assert.equal(attempts[0]?.outcome, "injected");
  assert.equal(attempts[0]?.code, "EPERM");
  assert.equal(attempts.at(-1)?.outcome, "committed");
  assert.equal(attempts.filter((attempt) => attempt.outcome === "injected").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.outcome === "committed").length, 1);
  const failures = attempts.filter((attempt) => attempt.outcome === "native-failed");
  for (const failure of failures)
    assert.ok(
      TRANSIENT_CODES.has(failure.code ?? ""),
      "native retry requires an observed eligible system error",
    );
  assert.equal(
    count,
    1 + failures.length + 1,
    "exact injection + observed system failures + one commit accounting",
  );
}
