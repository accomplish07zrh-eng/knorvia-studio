import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { prepareTasksIndexStorage } from "../src/session/tasksDatabase/startup.js";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import { AutomationRepo } from "../src/session/automationRepo.js";

test("storage startup preserves even a falsy primary error when close also fails", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-startup-failure-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const close = DatabaseSync.prototype.close;
  const closing = t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    close.call(this);
    throw new Error("secondary close failure");
  });
  let caught = false;
  try {
    await prepareTasksIndexStorage(join(dir, "tasks.sqlite"), (phase, migration) => {
      if (phase === "checking" && migration) throw undefined;
    });
  } catch (error) {
    caught = true;
    assert.equal(error, undefined);
  }
  assert.equal(caught, true);
  assert.equal(closing.mock.callCount(), 1);
});

test("storage startup reports a close failure after successful migration", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-startup-close-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const close = DatabaseSync.prototype.close;
  const failure = new Error("close failed");
  t.mock.method(DatabaseSync.prototype, "close", function (this: DatabaseSync) {
    close.call(this);
    throw failure;
  });
  const phases: string[] = [];
  await assert.rejects(prepareTasksIndexStorage(join(dir, "tasks.sqlite"), (phase) => phases.push(phase)), (error) => error === failure);
  assert.equal(phases.includes("ready"), false);
});

test("preparation failure wins while both repositories are closed", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-startup-repos-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const failure = new Error("prepare failed");
  t.mock.method(TaskIndexRepo.prototype, "ensureReady", async () => { throw failure; });
  const closed: string[] = [];
  t.mock.method(TaskIndexRepo.prototype, "close", () => { closed.push("tasks"); throw new Error("close tasks"); });
  t.mock.method(AutomationRepo.prototype, "close", () => { closed.push("automation"); throw new Error("close automation"); });
  await assert.rejects(prepareTasksIndexStorage(join(dir, "tasks.sqlite"), () => {}), (error) => error === failure);
  assert.deepEqual(closed, ["tasks", "automation"]);
});
