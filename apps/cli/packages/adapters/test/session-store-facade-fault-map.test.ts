// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test, { after } from "node:test";
import { SqliteSessionMigrationError } from "./session-store-facade.target.js";
import { fixture, owner, project, type Store } from "./session-store-facade-surface.fixture.js";

// This file must run in its own Node test process. The existing port caches its first rules.
const environmentKeys = ["KNORVIA_ENV", "KNORVIA_E2E_FS_FAULTS"] as const;
const savedEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
const faultId = "facade-native-fault-map";
process.env.KNORVIA_ENV = "test";
process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([
  {
    id: faultId,
    code: "EACCES",
    operations: ["sqliteRun"],
    pathEndsWith: ":memory:",
    maxMatches: 0,
  },
]);
after(() => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const gated = {
  createSession: (store: Store) => store.createSession(undefined as never),
  createForkedSessionWithMetadata: (store: Store) =>
    store.createForkedSessionWithMetadata(undefined as never, undefined as never),
  commitForkBundle: (store: Store) => store.commitForkBundle(undefined as never),
  commitSharedContextImportBundle: (store: Store) =>
    store.commitSharedContextImportBundle(undefined as never),
  transitionSharedContextImport: (store: Store) =>
    store.transitionSharedContextImport(undefined as never),
  updateSession: (store: Store) => store.updateSession(undefined as never),
  claimLegacySessionWorkspace: (store: Store) =>
    store.claimLegacySessionWorkspace(undefined as never),
  repairLegacyRemoteSessionWorkspace: (store: Store) =>
    store.repairLegacyRemoteSessionWorkspace(undefined as never),
  repairRemoteSessionPaths: (store: Store) => store.repairRemoteSessionPaths(undefined as never),
  saveMessage: (store: Store) => store.saveMessage(undefined as never),
  removeMessage: (store: Store) => store.removeMessage(undefined as never),
  savePart: (store: Store) => store.savePart(undefined as never),
  removePart: (store: Store) => store.removePart(undefined as never),
  saveSessionEntry: (store: Store) => store.saveSessionEntry(undefined as never),
  saveSessionInput: (store: Store) => store.saveSessionInput(undefined as never),
  commitPermissionFullAccess: (store: Store) =>
    store.commitPermissionFullAccess(undefined as never),
  updateSessionInputs: (store: Store) => store.updateSessionInputs(undefined as never),
  promoteSessionInput: (store: Store) => store.promoteSessionInput(undefined as never),
  markSessionInputPromoted: (store: Store) => store.markSessionInputPromoted(undefined as never),
  settleSessionInput: (store: Store) => store.settleSessionInput(undefined as never),
  updateTodos: (store: Store) => store.updateTodos(undefined as never),
  cloneTargetForFork: (store: Store) => store.cloneTargetForFork(undefined as never),
} satisfies Partial<Record<keyof Store, (store: Store) => Promise<unknown>>>;

test("fault map: all 22 guarded ports expose the configured original fault before argument validation", async (t) => {
  const { store, db } = fixture(t);
  const before = store.debugCounts();
  assert.equal(Object.keys(gated).length, 22);
  for (const [method, invoke] of Object.entries(gated)) {
    const pending = invoke(store);
    assert.ok(pending instanceof Promise, method);
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error, method);
      assert.equal(error instanceof SqliteSessionMigrationError, false, method);
      const fault = error as Error & {
        knorviaFsFaultId?: string;
        code?: string;
        syscall?: string;
        path?: string;
      };
      assert.equal(fault.knorviaFsFaultId, faultId, method);
      assert.equal(fault.code, "EACCES", method);
      assert.equal(fault.syscall, "sqliteRun", method);
      assert.equal(fault.path, ":memory:", method);
      assert.equal(Object.hasOwn(fault, "cause"), false, "the facade must not rewrap the fault");
      return true;
    });
    assert.equal(db.isTransaction, false, method);
    assert.deepEqual(store.debugCounts(), before, method);
  }
});

test("fault map: representative unguarded reads, permissions and journal remain callable under the same rule", async (t) => {
  const { store, db } = fixture(t);
  assert.equal(await store.getSession(owner), null);
  assert.deepEqual(await store.listSessions(), []);
  assert.deepEqual(await store.messages({ sessionID: owner }), []);
  assert.deepEqual(await store.readTodos({ sessionID: owner }), []);
  assert.equal(await store.clearTarget({ sessionID: owner }), false);
  assert.equal(store.saveProjectPermissionMode({ projectID: project, mode: "plan" }), "plan");
  assert.equal(store.getProjectPermissionMode(project), "plan");
  const permission: Parameters<Store["saveProjectPermission"]>[0]["permission"] = {
    version: 1,
    allow: [{ toolName: "Read" }],
  };
  assert.deepEqual(
    await store.saveProjectPermission({ projectID: project, permission }),
    permission,
  );
  assert.deepEqual(await store.getProjectPermission(project), permission);
  assert.equal(store.debugCounts().localSettings, 2);
  assert.equal(store.debugMigrationIds().length, 22);
  const journal = store.workflowJournalStore();
  assert.equal(journal.getRun("missing-native-run"), undefined);
  assert.equal(db.isTransaction, false);
});

test("facade guard still rejects ledger mutation before it reaches the repository", async (t) => {
  // 从 admission 迁来：用公开故障端口验收，避免锁定已经替换的私有守卫名称。
  const { store, db } = fixture(t);
  const before = store.debugCounts();
  const expected = {
    code: "EACCES",
    knorviaFsFaultId: faultId,
    syscall: "sqliteRun",
    path: ":memory:",
  };
  await assert.rejects(
    store.saveSessionInput({
      id: "input",
      sessionID: owner,
      kind: "sendText",
      delivery: "queue",
      payload: { text: "first" },
    }),
    expected,
  );
  await assert.rejects(store.updateSessionInputs({ sessionID: owner, updates: [] }), expected);
  assert.deepEqual(db.prepare("SELECT * FROM session_input").all(), []);
  assert.equal(await store.getSessionInputById("input"), null);
  assert.deepEqual(store.debugCounts(), before);
  assert.equal(db.isTransaction, false);
});
