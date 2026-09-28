// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type {
  CollaborationMode,
  PermissionRuleset,
  ProjectId,
  ProjectPermissionUpdateInput,
} from "@knorvia/contracts";
import * as repository from "../src/storage/session-store/repositories/local-settings.js";
import {
  localRow,
  memoryPermissions,
  projectID,
  rules,
  writeLegacy,
  writeLocal,
} from "./project-permission-fixture.js";

test("legacy rules are a missing-local fallback; null and malformed local values do not fall back", async (t) => {
  const db = memoryPermissions(t);
  assert.equal(await repository.getProjectPermission(db, projectID), null);
  writeLegacy(db, rules("Legacy"));
  assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("Legacy"));
  writeLocal(db, "null");
  assert.equal(await repository.getProjectPermission(db, projectID), null);
  db.prepare("UPDATE local_setting SET value=?").run("{");
  await assert.rejects(repository.getProjectPermission(db, projectID), SyntaxError);
  assert.equal(localRow(db)?.value, "{");
});

test("explicit overwrite retains timestamps and returns a serialized snapshot", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const db = memoryPermissions(t),
    value = rules("First");
  const result = await repository.saveProjectPermission(db, { projectID, permission: value });
  assert.deepEqual(result, value);
  assert.notEqual(result, value);
  assert.equal(localRow(db)?.time_created, 1000);
  t.mock.timers.tick(20);
  await repository.saveProjectPermission(db, { projectID, permission: rules("Replacement") });
  assert.equal(localRow(db)?.time_created, 1000);
  assert.equal(localRow(db)?.time_updated, 1020);
  assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("Replacement"));
});

test("project mode uses its original independent cell", (t) => {
  const db = memoryPermissions(t);
  assert.equal(repository.getProjectPermissionMode(db, projectID), null);
  for (const mode of ["build", "plan"] as CollaborationMode[]) {
    assert.equal(repository.saveProjectPermissionMode(db, { projectID, mode }), mode);
    assert.equal(repository.getProjectPermissionMode(db, projectID), mode);
  }
  db.prepare("UPDATE local_setting SET value=?").run('{"mode":"unsupported"}');
  assert.equal(repository.getProjectPermissionMode(db, projectID), null);
});

test("atomic update reads legacy, calls the transform once and commits a detached snapshot", async (t) => {
  const db = memoryPermissions(t),
    next = rules("Legacy", "Added");
  writeLegacy(db, rules("Legacy"));
  let calls = 0;
  const result = await repository.updateProjectPermission(db, {
    projectID,
    update(current) {
      calls++;
      assert.deepEqual(current, rules("Legacy"));
      assert.equal(db.isTransaction, true);
      return next;
    },
  });
  assert.equal(calls, 1);
  assert.equal(db.isTransaction, false);
  assert.deepEqual(result, next);
  assert.notEqual(result, next);
  next.allow!.push({ toolName: "Uncommitted" });
  assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("Legacy", "Added"));
  assert.equal(
    db.prepare("SELECT data FROM permission").get()?.data,
    JSON.stringify(rules("Legacy")),
  );
});

for (const stage of ["transform", "serialize", "sql", "commit"] as const)
  test(`atomic ${stage} failure rolls back only its transaction and remains retryable`, async (t) => {
    const db = memoryPermissions(t),
      failure = new Error("fixture " + stage);
    await repository.saveProjectPermission(db, { projectID, permission: rules("Retained") });
    const before = localRow(db);
    if (stage === "sql")
      db.exec(
        "CREATE TRIGGER reject_permission BEFORE UPDATE ON local_setting BEGIN SELECT RAISE(ABORT,'fixture sql'); END",
      );
    const exec = db.exec.bind(db);
    const commitMock =
      stage === "commit"
        ? t.mock.method(db, "exec", (sql: string) => {
            if (sql === "COMMIT") throw failure;
            exec(sql);
          })
        : undefined;
    await assert.rejects(
      repository.updateProjectPermission(db, {
        projectID,
        update() {
          if (stage === "transform") throw failure;
          if (stage === "serialize")
            return Object.assign(rules("Changed"), {
              toJSON() {
                throw failure;
              },
            });
          return rules("Changed");
        },
      }),
      (error) => (stage === "sql" ? String(error).includes("fixture sql") : error === failure),
    );
    assert.equal(db.isTransaction, false);
    assert.deepEqual(localRow(db), before);
    commitMock?.mock.restore();
    if (stage === "sql") db.exec("DROP TRIGGER reject_permission");
    assert.deepEqual(
      await repository.updateProjectPermission(db, { projectID, update: () => rules("Retry") }),
      rules("Retry"),
    );
  });

test("an existing transaction retains its changes and ownership when atomic update refuses", async (t) => {
  const db = memoryPermissions(t);
  db.exec("BEGIN IMMEDIATE");
  writeLocal(db, JSON.stringify(rules("Owner")));
  await assert.rejects(
    repository.updateProjectPermission(db, { projectID, update: () => rules("Intruder") }),
    /transaction/i,
  );
  assert.equal(db.isTransaction, true);
  assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("Owner"));
  db.exec("ROLLBACK");
  assert.equal(await repository.getProjectPermission(db, projectID), null);
});

test("an async transform is rejected without persisting a Promise as an empty ruleset", async (t) => {
  const db = memoryPermissions(t);
  const update = (() => Promise.resolve(rules("Later"))) as unknown as (
    current: PermissionRuleset | null,
  ) => PermissionRuleset;
  await assert.rejects(
    repository.updateProjectPermission(db, { projectID, update }),
    /synchronous/i,
  );
  assert.equal(db.isTransaction, false);
  assert.equal(localRow(db), undefined);
});

for (const serializedRoot of ["text", 42, true, []])
  test(`an atomic transform rejects a non-object serialized root: ${JSON.stringify(serializedRoot)}`, async (t) => {
    const db = memoryPermissions(t);
    await repository.saveProjectPermission(db, { projectID, permission: rules("Retained") });
    await assert.rejects(
      repository.updateProjectPermission(db, {
        projectID,
        update: () => Object.assign(rules("Changed"), { toJSON: () => serializedRoot }),
      }),
      /ruleset/i,
    );
    assert.equal(db.isTransaction, false);
    assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("Retained"));
  });

test("an updater cannot redirect the captured target to a different project", async (t) => {
  const db = memoryPermissions(t);
  const otherID = "different-permission-fixture" as ProjectId;
  const input: ProjectPermissionUpdateInput = {
    projectID,
    update() {
      input.projectID = otherID;
      return rules("OriginalTarget");
    },
  };
  await repository.updateProjectPermission(db, input);
  assert.deepEqual(await repository.getProjectPermission(db, projectID), rules("OriginalTarget"));
  assert.equal(await repository.getProjectPermission(db, otherID), null);
});

for (const source of ["local", "legacy"])
  test(`malformed ${source} rules reject before transforming and preserve the stored value`, async (t) => {
    const db = memoryPermissions(t);
    if (source === "local") writeLocal(db, "{");
    else db.prepare("INSERT INTO permission VALUES (?, 1, 1, ?)").run(projectID, "{");
    let calls = 0;
    await assert.rejects(
      repository.updateProjectPermission(db, {
        projectID,
        update() {
          calls++;
          return rules("Wrong");
        },
      }),
      SyntaxError,
    );
    assert.equal(calls, 0);
    assert.equal(db.isTransaction, false);
    assert.equal(
      source === "local"
        ? localRow(db)?.value
        : db.prepare("SELECT data FROM permission").get()?.data,
      "{",
    );
  });

test("a failed rollback preserves both causes without reporting a committed result", async (t) => {
  const db = memoryPermissions(t);
  const originalFailure = new Error("fixture transform"),
    rollbackFailure = new Error("fixture rollback");
  const exec = db.exec.bind(db);
  const hook = t.mock.method(db, "exec", (sql: string) => {
    if (sql === "ROLLBACK") throw rollbackFailure;
    exec(sql);
  });
  await assert.rejects(
    repository.updateProjectPermission(db, {
      projectID,
      update() {
        throw originalFailure;
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [originalFailure, rollbackFailure]);
      return true;
    },
  );
  assert.equal(db.isTransaction, true);
  assert.equal(localRow(db), undefined);
  hook.mock.restore();
  db.exec("ROLLBACK");
});
