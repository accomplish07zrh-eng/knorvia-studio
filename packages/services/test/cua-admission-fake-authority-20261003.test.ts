import assert from "node:assert/strict";
import { test } from "node:test";
import { CuaAgentAdmissionGate } from "../src/cua-permission-broker/cuaAgentAdmissionGate.js";

class FakeSignal {
  aborted = false;
  reason: unknown;
  listeners = new Set<() => void>();
  removed = 0;
  added = 0;
  onAdd?: () => void;
  onRemove?: () => void;
  removeFailure?: Error;
  addEventListener(name: string, listener: () => void, options: { once: boolean }) {
    assert.equal(name, "abort");
    assert.equal(options.once, true);
    this.added++;
    this.listeners.add(listener);
    this.onAdd?.();
  }
  removeEventListener(name: string, listener: () => void) {
    assert.equal(name, "abort");
    this.removed++;
    if (this.removeFailure) throw this.removeFailure;
    this.listeners.delete(listener);
    this.onRemove?.();
  }
  abort(reason: unknown) {
    this.reason = reason;
    this.aborted = true;
    for (const listener of new Set(this.listeners)) {
      this.listeners.delete(listener);
      listener();
    }
  }
  context() {
    return {
      workspaceKey: "synthetic-workspace",
      workspacePath: "/synthetic/work",
      workspaceIdentity: "synthetic-identity",
      signal: this as unknown as AbortSignal,
    };
  }
}

test("synthetic admission preserves epochs, cancellation reasons, live waiters and failure ordering without authority", async () => {
  const gate = new CuaAgentAdmissionGate();
  assert.equal(gate.isRecovering(), false);
  const initiallyAborted = new FakeSignal();
  initiallyAborted.abort(false);
  await assert.rejects(
    gate.waitForSpawnAdmission(initiallyAborted.context()),
    (error) => error === false,
  );
  const open = new FakeSignal();
  await gate.waitForSpawnAdmission(open.context());
  assert.equal(open.added, 0);
  const epoch = gate.beginRecovery();
  assert.equal(epoch, 1);
  assert.equal(gate.beginRecovery(), epoch);
  const first = new FakeSignal(),
    second = new FakeSignal();
  const one = gate.waitForSpawnAdmission(first.context()),
    two = gate.waitForSpawnAdmission(second.context());
  assert.equal(gate.commitRecovery(20), false);
  const nativeAbort = new Error("synthetic admission abort");
  const abortCheck = assert.rejects(two, (error) => error === nativeAbort);
  second.abort(nativeAbort);
  await abortCheck;
  assert.equal(gate.commitRecovery(epoch), true);
  await one;
  assert.equal(first.removed, 1);
  assert.equal(second.removed, 0);
  const shared = new Error("synthetic shared recovery failure");
  const failedEpoch = gate.beginRecovery();
  assert.equal(failedEpoch, 2);
  const three = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-a" });
  const four = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-b" });
  const failures = Promise.all([
    assert.rejects(three, (error) => error === shared),
    assert.rejects(four, (error) => error === shared),
  ]);
  assert.equal(gate.failRecovery(failedEpoch, shared), true);
  await failures;
  assert.equal(gate.isRecovering(), false);

  const fallback = new FakeSignal();
  fallback.aborted = true;
  await assert.rejects(
    gate.waitForSpawnAdmission(fallback.context()),
    /Knorvia Studio agent process start was cancelled\./,
  );
  const syncAbort = new FakeSignal();
  syncAbort.onAdd = () => syncAbort.abort(0);
  const syncEpoch = gate.beginRecovery();
  await assert.rejects(gate.waitForSpawnAdmission(syncAbort.context()), (error) => error === 0);
  assert.equal(gate.commitRecovery(syncEpoch), true);
  assert.equal(syncAbort.removed, 1);

  const removeError = new Error("synthetic listener cleanup failure");
  const broken = new FakeSignal();
  broken.removeFailure = removeError;
  const brokenEpoch = gate.beginRecovery();
  const waiting = gate.waitForSpawnAdmission(broken.context());
  assert.throws(
    () => gate.commitRecovery(brokenEpoch),
    (error) => error === removeError,
  );
  assert.equal(gate.isRecovering(), false);
  broken.removeFailure = undefined;
  assert.equal(gate.commitRecovery(gate.beginRecovery()), true);
  await waiting;

  const conversionError = new Error("synthetic failure conversion");
  const conversionEpoch = gate.beginRecovery();
  const conversionWait = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-conversion" });
  assert.throws(
    () =>
      gate.failRecovery(conversionEpoch, {
        toString() {
          throw conversionError;
        },
      }),
    (error) => error === conversionError,
  );
  assert.equal(gate.isRecovering(), false);
  assert.equal(gate.commitRecovery(gate.beginRecovery()), true);
  await conversionWait;

  const reentrantSignal = new FakeSignal();
  let newEpoch = 0;
  let reentrantWait: Promise<void> | undefined;
  const previousEpoch = gate.beginRecovery();
  const previousWait = gate.waitForSpawnAdmission(reentrantSignal.context());
  reentrantSignal.onRemove = () => {
    reentrantSignal.onRemove = undefined;
    newEpoch = gate.beginRecovery();
    reentrantWait = gate.waitForSpawnAdmission({ workspaceKey: "synthetic-reentrant" });
  };
  assert.equal(gate.commitRecovery(previousEpoch), true);
  await previousWait;
  await reentrantWait;
  assert.equal(gate.isRecovering(), true);
  assert.equal(gate.commitRecovery(newEpoch), true);
  assert.equal(
    gate.failRecovery(-1, {
      toString() {
        throw new Error("must not convert stale epoch");
      },
    }),
    false,
  );
});
