// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { SessionTaskType } from "@knorvia/contracts";
import {
  id,
  pid,
  project,
  recordsFixture,
  sessions,
  sid,
  wid,
  workspace,
} from "./session-records-fixture.js";

for (const [path, foreign] of [
  ["/work/my_project", "/work/myXproject"],
  ["/work/rate%done", "/work/rate-any-done"],
  ["/work/a\\_%", "/work/a\\XYZ"],
]) {
  test(`path filter treats ${path} as literal directory`, async (t) => {
    const f = recordsFixture(t);
    for (const [name, value] of [
      ["root", path],
      ["child", path + "/child"],
      ["foreign", foreign + "/child"],
      ["sibling", path + "-other/child"],
    ])
      f.create({ id: sid(name), path: value });
    assert.deepEqual(
      (await sessions.listSessions(f.db, { path })).map((s) => s.id),
      ["root", "child"],
    );
  });
}

test("path retains empty, trailing-slash and native LIKE case rules", async (t) => {
  const f = recordsFixture(t);
  for (const [name, path] of [
    ["null", undefined],
    ["empty", ""],
    ["base", "/Case/Base"],
    ["child", "/case/base/child"],
    ["slash", "/Case/Base/"],
    ["double", "/Case/Base//child"],
    ["near", "/Case/Base2/child"],
  ] as const)
    f.create({ id: sid(name), path });
  const names = async (path: string) =>
    (await sessions.listSessions(f.db, { path })).map((s) => s.id).sort();
  assert.deepEqual(await names(""), ["empty", "null"]);
  assert.deepEqual(await names("/Case/Base"), ["base", "child", "double", "slash"]);
  assert.deepEqual(await names("/Case/Base/"), ["double", "slash"]);
});

test("filters intersect without widening identity or archival boundaries", async (t) => {
  const f = recordsFixture(t);
  f.create({
    id: sid("match"),
    path: "/work/base/child",
    workspaceID: workspace,
    taskType: "fork",
  });
  f.create({
    id: sid("wrong-project"),
    projectID: pid("other"),
    path: "/work/base/child",
    workspaceID: workspace,
    taskType: "fork",
  });
  f.create({
    id: sid("wrong-workspace"),
    path: "/work/base/child",
    workspaceID: wid("other"),
    taskType: "fork",
  });
  f.create({
    id: sid("child"),
    parentID: id,
    path: "/work/base/child",
    workspaceID: workspace,
    taskType: "fork",
  });
  f.create({
    id: sid("archived"),
    path: "/work/base/child",
    workspaceID: workspace,
    taskType: "fork",
  });
  await sessions.updateSession(f.db, { id: sid("archived"), timeArchived: 0, timeUpdated: 20 });
  f.create({ id: sid("interactive"), path: "/work/base/child", workspaceID: workspace });
  const filter = {
    projectID: project,
    workspaceID: workspace,
    directory: "/work/root",
    path: "/work/base",
    roots: true,
    taskTypes: ["fork", "fork", "invalid"] as SessionTaskType[],
    limit: 1,
  };
  assert.deepEqual(
    (await sessions.listSessions(f.db, filter)).map((s) => s.id),
    ["match"],
  );
  assert.equal(
    (await sessions.listSessions(f.db, { ...filter, includeArchived: true, limit: 0 })).length,
    2,
  );
  assert.equal((await sessions.listSessions(f.db, { ...filter, directory: "/wrong" })).length, 0);
});

test("NULL and empty identities and parents remain distinct at query time", async (t) => {
  const f = recordsFixture(t);
  f.create({ id: sid("null") });
  f.create({ id: sid("empty"), workspaceID: wid(""), parentID: sid("") });
  f.create({ id: sid("set"), workspaceID: workspace });
  assert.deepEqual(
    (await sessions.listSessions(f.db, { workspaceID: null })).map((s) => s.id),
    ["null"],
  );
  assert.deepEqual(
    (await sessions.listSessions(f.db, { workspaceID: wid("") })).map((s) => s.id),
    ["empty"],
  );
  assert.deepEqual(
    (await sessions.listSessions(f.db, { roots: true })).map((s) => s.id),
    ["set", "null"],
  );
  assert.equal(
    (
      await sessions.listSessions(f.db, {
        projectID: pid(""),
        directory: "",
        taskTypes: ["invalid"] as unknown as SessionTaskType[],
      })
    ).length,
    3,
  );
});

test("ordering is activity then ID descending; limits preserve native validation", async (t) => {
  const f = recordsFixture(t);
  f.create({ id: sid("a") });
  f.create({ id: sid("z") });
  f.create({ id: sid("recent"), time: { updated: 30 } });
  assert.deepEqual(
    (await sessions.listSessions(f.db)).map((s) => s.id),
    ["recent", "z", "a"],
  );
  assert.deepEqual(
    (await sessions.listSessions(f.db, { limit: 2 })).map((s) => s.id),
    ["recent", "z"],
  );
  for (const limit of [0, -1, NaN])
    assert.equal((await sessions.listSessions(f.db, { limit })).length, 3);
  await assert.rejects(sessions.listSessions(f.db, { limit: 0.5 }), /datatype mismatch/);
});
