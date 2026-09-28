// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import * as repository from "../src/storage/session-store/repositories/local-settings.js";
import { diskPermissions, projectID, rules } from "./project-permission-fixture.js";
import { permissionWriter } from "./project-permission-process-fixture.js";

test("two independent processes retain all their appended project grants", async (t) => {
  const fixture = await diskPermissions(t);
  const writers = ["A", "B"].map((prefix) =>
    permissionWriter(
      fixture,
      `
    for (let index=0; index<8; index++) {
      await updateProjectPermission(db, {projectID, update: current => ({
        ...current, version:1,
        allow:[...(current?.allow ?? []), {toolName:${JSON.stringify(prefix)}+index}]
      })});
    }
  `,
    ),
  );
  await Promise.all(writers.map((writer) => writer.wait("ready")));
  writers.forEach((writer) => writer.send("start"));
  const codes = await Promise.all(writers.map((writer) => writer.exited));
  assert.deepEqual(codes, [0, 0], writers.map((writer) => writer.errors()).join("\n"));
  const saved = await repository.getProjectPermission(fixture.db, projectID);
  const names = saved?.allow?.map((rule) => rule.toolName) ?? [];
  assert.equal(names.length, 16);
  for (const prefix of ["A", "B"])
    assert.deepEqual(
      names.filter((name) => name.startsWith(prefix)),
      Array.from({ length: 8 }, (_, index) => prefix + index),
    );
  assert.equal(fixture.db.isTransaction, false);
});

const lockHolder = `
  db.exec('BEGIN IMMEDIATE');
  db.prepare("INSERT INTO local_setting VALUES ('project', ?, 'permission', 'ruleset', ?, 1, 1, 1)")
    .run(projectID, JSON.stringify({version:1,allow:[{toolName:'Writer'}]}));
  const release=receive(); signal('locked'); await release;
  db.exec('COMMIT');
`;

test("an atomic waiter reads the value committed by the existing writer", async (t) => {
  const fixture = await diskPermissions(t);
  const holder = permissionWriter(fixture, lockHolder);
  await holder.wait("ready");
  holder.send("start");
  await holder.wait("locked");
  const waiter = permissionWriter(
    fixture,
    `
    signal('attempting');
    await updateProjectPermission(db, {projectID, update: current => {
      if(current?.allow?.[0]?.toolName !== 'Writer') throw new Error('Read stale rules');
      return {...current, version:1, allow:[...current.allow,{toolName:'Waiter'}]};
    }});
  `,
  );
  await waiter.wait("ready");
  waiter.send("start");
  await waiter.wait("attempting");
  holder.send("release");
  assert.equal(await holder.exited, 0, holder.errors());
  assert.equal(await waiter.exited, 0, waiter.errors());
  assert.deepEqual(
    await repository.getProjectPermission(fixture.db, projectID),
    rules("Writer", "Waiter"),
  );
});

test("a busy connection fails without invoking the transform or rolling back the other writer", async (t) => {
  const fixture = await diskPermissions(t);
  const holder = permissionWriter(fixture, lockHolder);
  await holder.wait("ready");
  holder.send("start");
  await holder.wait("locked");
  const contender = new DatabaseSync(fixture.path);
  let calls = 0;
  try {
    contender.exec("PRAGMA busy_timeout=10");
    await assert.rejects(
      repository.updateProjectPermission(contender, {
        projectID,
        update() {
          calls++;
          return rules("Wrong");
        },
      }),
      /locked|busy/i,
    );
    assert.equal(calls, 0);
    assert.equal(contender.isTransaction, false);
    assert.equal(await repository.getProjectPermission(contender, projectID), null);
    holder.send("release");
    assert.equal(await holder.exited, 0, holder.errors());
    assert.deepEqual(await repository.getProjectPermission(contender, projectID), rules("Writer"));
  } finally {
    contender.close();
  }
});
