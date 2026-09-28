// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  id,
  permission,
  pid,
  recordsFixture,
  revert,
  sessions,
  sid,
  wid,
  workspace,
} from "./session-records-fixture.js";

test("legacy claim intersects exact allowlist, directory and NULL workspace", (t) => {
  const f = recordsFixture(t);
  f.create();
  f.create({ id: sid("outside") });
  f.create({ id: sid("wrong-directory"), directory: "/work/root/child" });
  f.create({ id: sid("bound"), workspaceID: workspace });
  f.create({ id: sid("empty"), workspaceID: wid("") });
  const before = f.row();
  const count = sessions.claimLegacySessionWorkspace(f.db, {
    sessionIDs: [id, id, sid("missing"), sid("wrong-directory"), sid("bound"), sid("empty")],
    directory: "/work/root",
    workspaceID: wid("claimed"),
  });
  assert.equal(count, 1);
  assert.deepEqual(f.row(), { ...before, workspace_id: "claimed" });
  assert.equal(f.row(sid("outside")).workspace_id, null);
  assert.equal(f.row(sid("empty")).workspace_id, "");
  assert.equal(
    sessions.claimLegacySessionWorkspace(f.db, {
      sessionIDs: [id],
      directory: "/work/root",
      workspaceID: wid("again"),
    }),
    0,
  );
});

test("empty claim returns zero without executing SQL", (t) => {
  const f = recordsFixture(t);
  t.mock.method(f.db, "prepare", () => {
    throw new Error("SQL must not execute");
  });
  assert.equal(
    sessions.claimLegacySessionWorkspace(f.db, {
      sessionIDs: [],
      directory: "/work/root",
      workspaceID: workspace,
    }),
    0,
  );
});

for (const oldPath of [undefined, "/legacy", "", "/different"] as const) {
  test(`legacy remote repair obeys exact old path ${String(oldPath)}`, async (t) => {
    const f = recordsFixture(t);
    f.create({ directory: "/legacy", path: oldPath, permission });
    await sessions.updateSession(f.db, { id, revert, timeArchived: 0, timeUpdated: 20 });
    const before = f.row();
    const result = sessions.repairLegacyRemoteSessionWorkspace(f.db, {
      sessionID: id,
      projectID: pid("repaired"),
      workspaceID: workspace,
      legacyWorkspaceDirectory: "/legacy",
      workspacePath: "/new",
    });
    const expected = oldPath === undefined || oldPath === "/legacy";
    assert.equal(result, expected);
    assert.deepEqual(
      f.row(),
      expected
        ? {
            ...before,
            project_id: "repaired",
            workspace_id: workspace,
            directory: "/new",
            path: "/new",
          }
        : before,
    );
    if (expected)
      assert.equal(
        sessions.repairLegacyRemoteSessionWorkspace(f.db, {
          sessionID: id,
          projectID: pid("other"),
          workspaceID: wid("other"),
          legacyWorkspaceDirectory: "/new",
          workspacePath: "/later",
        }),
        false,
      );
  });
}

test("path compare-and-swap distinguishes null and empty; changes only path and monotonic activity", async (t) => {
  const f = recordsFixture(t);
  f.create({ workspaceID: workspace, permission, titleSource: "custom" });
  await sessions.updateSession(f.db, {
    id,
    revert,
    summary: { files: 5 },
    timeArchived: 0,
    timeUpdated: 100,
  });
  const before = f.row();
  const repair = {
    sessionID: id,
    workspaceID: workspace,
    expectedDirectory: "/work/root",
    expectedPath: null,
    directory: "/new",
    path: "",
    timeUpdated: 10,
  };
  for (const patch of [
    { expectedPath: "" },
    { workspaceID: wid("wrong") },
    { expectedDirectory: "/wrong" },
    { sessionID: sid("missing") },
  ])
    assert.equal(sessions.repairRemoteSessionPaths(f.db, { ...repair, ...patch }), false);
  assert.deepEqual(f.row(), before);
  assert.equal(sessions.repairRemoteSessionPaths(f.db, repair), true);
  assert.deepEqual(f.row(), { ...before, directory: "/new", path: "" });
  assert.equal(sessions.repairRemoteSessionPaths(f.db, repair), false);
  const same = { ...repair, expectedDirectory: "/new", expectedPath: "", timeUpdated: 110 };
  assert.equal(sessions.repairRemoteSessionPaths(f.db, same), true);
  assert.equal(sessions.repairRemoteSessionPaths(f.db, same), true);
  assert.equal(f.row().time_updated, 110);
});

test("touch changes only activity, is monotonic, joins caller transaction and ignores missing ID", (t) => {
  const f = recordsFixture(t);
  f.create({ titleSource: "custom" });
  const before = f.row();
  sessions.touchSession(f.db, sid("missing"), 200);
  sessions.touchSession(f.db, id, 0);
  assert.deepEqual(f.row(), before);
  f.db.exec("BEGIN IMMEDIATE");
  sessions.touchSession(f.db, id, 100);
  assert.deepEqual(f.row(), { ...before, time_updated: 100 });
  assert.equal(f.db.isTransaction, true);
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.row(), before);
});
