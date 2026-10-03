// Synthetic observer contracts; repository transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { createCreationIoFixtureTrace } from "./creation-io-fixture-trace.js";
const data = (text: string) => JSON.parse(text.slice("creation IO=".length));
const root = resolve("fixture-private-root");

test("IO observation returns the original promise and excludes sibling paths", async () => {
  let time = 0;
  const monitor = createCreationIoFixtureTrace(() => time);
  const scope = monitor.watch(root);
  const gate = Promise.withResolvers<number>();
  assert.equal(
    monitor.run(join(root, "jobs.json"), "records.write", () => gate.promise),
    gate.promise,
  );
  assert.equal(data(scope.describe()).pending.length, 1);
  assert.equal(scope.describe().includes(root), false);
  assert.equal(scope.describe().includes("jobs.json"), false);
  time = 12;
  gate.resolve(7);
  await gate.promise;
  assert.deepEqual(data(scope.describe()).counts["records.write"], {
    started: 1,
    completed: 1,
    failed: 0,
  });
  assert.equal(data(scope.describe()).pending.length, 0);
  await monitor.run(root + "-other", "asset.write", async () => 1);
  assert.equal(data(scope.describe()).counts["asset.write"], undefined);
});

test("rejections and synchronous throws keep exact identity without exposing messages", async () => {
  const monitor = createCreationIoFixtureTrace();
  const scope = monitor.watch(root);
  const failure = Object.assign(new Error("private error details"), { code: "EPERM" });
  const pending = Promise.reject(failure);
  assert.equal(
    monitor.run(root, "asset.write", () => pending),
    pending,
  );
  await assert.rejects(pending, (error) => error === failure);
  assert.throws(
    () =>
      monitor.run(root, "records.write", () => {
        throw failure;
      }),
    (error) => error === failure,
  );
  const result = scope.describe();
  assert.match(result, /error-EPERM/);
  assert.equal(result.includes(failure.message), false);
  assert.equal(data(result).counts["asset.write"].failed, 1);
});

test("old window completions and release do not change the replacement window", async () => {
  const monitor = createCreationIoFixtureTrace();
  const old = monitor.watch(root);
  const gate = Promise.withResolvers<void>();
  monitor.run(root, "records.write", () => gate.promise);
  const current = monitor.watch(root);
  old.release();
  gate.resolve();
  await gate.promise;
  assert.deepEqual(data(current.describe()).counts, {});
  await monitor.run(root, "asset.write", async () => 1);
  assert.equal(data(current.describe()).counts["asset.write"].completed, 1);
  current.release();
  await monitor.run(root, "asset.write", async () => 2);
  assert.equal(data(current.describe()).counts["asset.write"].completed, 1);
});

test("event output stays bounded while counters retain all operations", async () => {
  const monitor = createCreationIoFixtureTrace();
  const scope = monitor.watch(root);
  for (let index = 0; index < 30; index++)
    await monitor.run(root, "records.write", async () => index);
  const result = data(scope.describe());
  assert.equal(result.firstEvents.length, 24);
  assert.equal(result.counts["records.write"].completed, 30);
});
