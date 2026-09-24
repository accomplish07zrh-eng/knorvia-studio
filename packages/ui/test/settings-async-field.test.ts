import assert from "node:assert/strict";
import test from "node:test";
import {
  createAsyncSettingField,
  createAsyncSettingFieldRegistry,
} from "../src/settings/asyncSettingField.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const create = () => createAsyncSettingField("initial", (value) => value.trim());

test("returning to a settings page preserves pending writes and failures within its service boundary", async () => {
  const registry = createAsyncSettingFieldRegistry();
  const service = {};
  const trim = (value: string) => value.trim();
  const field = registry.get(service, "proxy", "initial", trim);
  const pending = deferred();
  field.edit("new proxy");
  const saving = field.save(() => pending.promise);
  const remounted = registry.get(service, "proxy", "initial", trim);
  assert.equal(remounted, field);
  assert.equal(remounted.getSnapshot().pending, true);
  assert.equal(await remounted.save(async () => assert.fail("duplicate write")), false);
  pending.reject(new Error("offline"));
  await saving;
  assert.equal(remounted.getSnapshot().error, "offline");
  assert.equal(remounted.getSnapshot().value, "new proxy");
  const otherService = registry.get({}, "proxy", "other window", trim);
  assert.equal(otherService.getSnapshot().value, "other window");
  assert.equal(otherService.getSnapshot().pending, false);
});

test("a setting ACK and prop update preserve text typed while the request was pending", async () => {
  for (const syncBeforeAck of [true, false]) {
    const field = create();
    const pending = deferred();
    field.edit(" saved A ");
    const saving = field.save(async (value) => {
      assert.equal(value, "saved A");
      await pending.promise;
    });
    field.edit("unsaved B");
    if (syncBeforeAck) field.sync("saved A");
    pending.resolve();
    assert.equal(await saving, true);
    if (!syncBeforeAck) field.sync("saved A");
    assert.equal(field.getSnapshot().value, "unsaved B");
    assert.equal(field.getSnapshot().baseline, "saved A");
    assert.equal(field.getSnapshot().dirty, true);
    assert.equal(field.getSnapshot().pending, false);
  }
});

test("Enter and a save-button click share one immediate lock", async () => {
  const field = create();
  const pending = deferred();
  let calls = 0;
  const commit = () => {
    calls++;
    return pending.promise;
  };
  field.edit("next");
  const saving = field.save(commit);
  assert.equal(await field.save(commit), false);
  assert.equal(calls, 1);
  pending.resolve();
  await saving;
  assert.equal(field.getSnapshot().dirty, false);
  assert.equal(await field.save(commit), false);
  assert.equal(calls, 1);
});

test("failed writes expose their error, retain newer edits and allow a fresh retry", async () => {
  const field = create();
  const pending = deferred();
  field.edit("attempt A");
  const saving = field.save(() => pending.promise);
  field.edit("attempt B");
  pending.reject(new Error("storage unavailable"));
  assert.equal(await saving, false);
  assert.equal(field.getSnapshot().value, "attempt B");
  assert.equal(field.getSnapshot().error, "storage unavailable");
  assert.equal(field.getSnapshot().pending, false);
  assert.equal(
    await field.save(async (value) => {
      assert.equal(value, "attempt B");
    }),
    true,
  );
  assert.equal(field.getSnapshot().error, "");
  assert.equal(field.getSnapshot().dirty, false);
});

test("external settings updates synchronize untouched fields but never replace local edits", () => {
  const field = create();
  field.sync("external A");
  assert.equal(field.getSnapshot().value, "external A");
  field.edit("local B");
  field.sync("external C");
  assert.equal(field.getSnapshot().value, "local B");
  assert.equal(field.getSnapshot().baseline, "external C");
  assert.equal(field.getSnapshot().dirty, true);
});

test("unsubscribing on page close prevents late request notifications reaching the old view", async () => {
  const field = create();
  const pending = deferred();
  let notifications = 0;
  const unsubscribe = field.subscribe(() => notifications++);
  field.edit("new");
  const saving = field.save(() => pending.promise);
  unsubscribe();
  const before = notifications;
  pending.resolve();
  await saving;
  assert.equal(notifications, before);
});

test("normalization is committed once without rewriting in-progress source text", async () => {
  const field = createAsyncSettingField("", (value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(","),
  );
  field.edit(" localhost, ,example.test ");
  assert.equal(field.getSnapshot().value, " localhost, ,example.test ");
  await field.save(async (value) => {
    assert.equal(value, "localhost,example.test");
  });
  assert.equal(field.getSnapshot().value, "localhost,example.test");
  assert.equal(field.getSnapshot().dirty, false);
});
