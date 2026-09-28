// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqliteSessionStore } from "./session-store-facade.target.js";

for (const [label, primary] of [
  ["undefined", undefined],
  ["object", { sentinel: "progress" }],
] as const) {
  test(`startup preserves original ${label} rejection when its close also throws`, async (t) => {
    const close = SqliteSessionStore.prototype.close;
    const closed: DatabaseSync[] = [];
    t.mock.method(SqliteSessionStore.prototype, "close", function (this: SqliteSessionStore) {
      const connection: unknown = Reflect.get(this, "db");
      assert.ok(connection instanceof DatabaseSync);
      closed.push(connection);
      close.call(this);
      throw new Error("secondary close sentinel");
    });
    const [outcome] = await Promise.allSettled([
      SqliteSessionStore.openStartup(
        { dbPath: ":memory:" },
        {
          onProgress: async (progress) => {
            if (progress.phase === "ready") return Promise.reject(primary);
          },
        },
      ),
    ]);
    assert.equal(closed.length, 1);
    assert.equal(closed[0]!.isOpen, false);
    assert.equal(outcome!.status, "rejected");
    if (outcome!.status !== "rejected") assert.fail("expected original rejection");
    assert.equal(Object.hasOwn(outcome, "reason"), true);
    assert.strictEqual(outcome!.reason, primary);
  });
}
