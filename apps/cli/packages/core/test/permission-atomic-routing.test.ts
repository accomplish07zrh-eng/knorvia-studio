// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionRuleset, ProjectPermissionUpdateInput } from "@knorvia/contracts";
import { grantFixture, grantUpdate } from "./permission-grant-fixture.js";
import { gate } from "./tool-invocation-fixture.js";
import { persistProjectPermissionUpdates } from "../src/tool/executor/permission-rules-persistence.js";
import * as repository from "../../adapters/src/storage/session-store/repositories/local-settings.js";
import { memoryPermissions, projectID } from "../../adapters/test/project-permission-fixture.js";

type AtomicInput = ProjectPermissionUpdateInput;

test("project grants prefer the atomic owner and retain receiver and current rules", async () => {
  const f = grantFixture();
  let merged: PermissionRuleset | undefined;
  Object.assign(f.store, {
    getProjectPermission: async () => {
      throw new Error("legacy read must not run");
    },
    saveProjectPermission: async () => {
      throw new Error("legacy write must not run");
    },
    async updateProjectPermission(input: AtomicInput) {
      assert.equal(this, f.store);
      assert.equal(input.projectID, "fixture-project");
      merged = input.update({ version: 1, deny: [{ toolName: "Retained" }] });
      return merged;
    },
  });
  await persistProjectPermissionUpdates(f.deps, grantUpdate("New"), f.trace);
  assert.deepEqual(merged, {
    version: 1,
    deny: [{ toolName: "Retained" }],
    allow: [{ toolName: "New" }],
  });
  assert.deepEqual(f.timeline, ["store.session"]);
  assert.equal(f.observed.logs.at(-1)?.[1], "Project permission updated");
});

test("atomic failure is preserved and never triggers a legacy fallback", async () => {
  const f = grantFixture(),
    failure = { fixture: "atomic failure" };
  Object.assign(f.store, {
    async updateProjectPermission() {
      throw failure;
    },
  });
  await assert.rejects(
    persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace),
    (error) => error === failure,
  );
  assert.deepEqual(f.timeline, ["store.session"]);
  assert.deepEqual(f.writes, []);
});

test("the store can defer the synchronous transform without copying the original updates", async () => {
  const f = grantFixture(),
    entered = gate(),
    release = gate();
  const updates = grantUpdate("Before");
  let saved: PermissionRuleset | undefined;
  Object.assign(f.store, {
    async updateProjectPermission(input: AtomicInput) {
      entered.resolve();
      await release.promise;
      saved = input.update(null);
      return saved;
    },
  });
  const pending = persistProjectPermissionUpdates(f.deps, updates, f.trace);
  await Promise.race([
    entered.promise,
    pending.then(() => {
      throw new Error("atomic owner was bypassed");
    }),
  ]);
  updates.push(...grantUpdate("After"));
  release.resolve();
  await pending;
  assert.deepEqual(
    saved?.allow?.map((rule) => rule.toolName),
    ["Before", "After"],
  );
});

test("legacy stores keep the original read and overwrite sequence", async () => {
  const f = grantFixture();
  await persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  assert.deepEqual(f.timeline, ["store.session", "store.rules", "store.save"]);
  assert.equal(f.observed.logs.at(-1)?.[1], "Project permission updated");
  assert.equal(f.writes.length, 1);
});

test("probing the optional atomic capability does not reread the legacy store owner", async () => {
  const f = grantFixture();
  let reads = 0;
  Object.defineProperty(f.deps, "sessionStore", {
    get() {
      if (++reads > 4) throw new Error("legacy owner was read again");
      return f.store;
    },
  });
  await persistProjectPermissionUpdates(f.deps, grantUpdate(), f.trace);
  assert.equal(reads, 4);
  assert.equal(f.writes.length, 1);
});

test("logging after an atomic commit cannot undo it and prevents the later session phase", async () => {
  const f = grantFixture();
  let saved: PermissionRuleset | undefined;
  Object.assign(f.store, {
    async updateProjectPermission(input: AtomicInput) {
      saved = input.update(null);
      return saved;
    },
  });
  f.deps.logger!.info = () => {
    throw new Error("fixture logging");
  };
  const result = await f.apply({
    decision: "allow",
    permissionUpdates: grantUpdate(),
    sessionPermissionUpdates: grantUpdate(),
  });
  assert.equal(result?.error?.type, "storage_error");
  assert.deepEqual(saved?.allow, [{ toolName: "Fixture" }]);
  assert.deepEqual(f.sessionGrants, []);
  assert.equal(f.writes.length, 0);
});

test("two real repository grants for one project retain both updates", async (t) => {
  const db = memoryPermissions(t),
    f = grantFixture();
  Object.assign(f.store, {
    getSession: async () => ({ projectID }),
    getProjectPermission: () => repository.getProjectPermission(db, projectID),
    saveProjectPermission: (input: { permission: PermissionRuleset }) =>
      repository.saveProjectPermission(db, { projectID, permission: input.permission }),
    updateProjectPermission: (input: AtomicInput) => repository.updateProjectPermission(db, input),
  });
  await Promise.all(
    ["A", "B"].map((name) => persistProjectPermissionUpdates(f.deps, grantUpdate(name), f.trace)),
  );
  assert.deepEqual((await repository.getProjectPermission(db, projectID))?.allow, [
    { toolName: "A" },
    { toolName: "B" },
  ]);
});
