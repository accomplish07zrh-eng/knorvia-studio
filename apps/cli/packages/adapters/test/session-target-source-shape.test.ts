// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, seedTarget } from "./session-target.fixture.js";
import { target, type SessionGoal } from "./session-target-test-api.js";

for (const shape of ["inherited", "unused-activity-getters"] as const) {
  test(`clone preserves structural source facts with ${shape}`, async (t) => {
    const f = await fixture(t);
    const original = seedTarget(f, {
      status: "complete",
      activeInputId: "parent-run",
      activeRunStartedAtMs: 1100,
      activeRunLastSeenAtMs: 1900,
    });
    const childID = "child" as typeof f.sessionID;
    await f.store.createSession({
      id: childID,
      projectID: "synthetic" as Parameters<typeof f.store.createSession>[0]["projectID"],
      slug: "child",
      directory: "/synthetic/target-shape",
      title: "Child",
      version: "fixture",
      time: { created: 50, updated: 80 },
    });
    const source = (
      shape === "inherited" ? Object.create(original) : { ...original }
    ) as SessionGoal;
    let activityReads = 0;
    if (shape === "unused-activity-getters") {
      for (const key of ["activeInputId", "activeRunStartedAtMs", "activeRunLastSeenAtMs"]) {
        Object.defineProperty(source, key, {
          enumerable: true,
          get() {
            activityReads++;
            throw new Error("fork must not read discarded source activity");
          },
        });
      }
    } else {
      assert.deepEqual(Object.keys(source), []);
    }
    const result = target.cloneSessionTargetForFork(f.db, {
      source,
      sessionID: childID,
      status: "paused",
    });
    assert.equal(activityReads, 0);
    assert.deepEqual(result, {
      ...original,
      sessionID: childID,
      status: "paused",
      activeInputId: null,
      activeRunStartedAtMs: null,
      activeRunLastSeenAtMs: null,
    });
    assert.deepEqual(target.readSessionTarget(f.db, { sessionID: childID }), result);
    assert.deepEqual(target.readSessionTarget(f.db, { sessionID: f.sessionID }), original);
    assert.equal(f.db.isTransaction, false);
  });
}
