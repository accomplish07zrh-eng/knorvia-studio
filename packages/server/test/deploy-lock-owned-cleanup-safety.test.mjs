import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { acquireRemoteDeployLock } from "../src/remote/remoteDeployLock.ts";

test("release timeout cleans only owned streams and retains its diagnostic identity", async () => {
  const order = [];
  const stderr = new EventEmitter();
  const stdout = new EventEmitter();
  const close = new EventEmitter();
  const token = "synthetic-owner";
  const stdin = {
    write(value) {
      order.push(["write", value]);
      stderr.emit("data", Buffer.from("before"));
      return true;
    },
    end() {
      order.push(["end"]);
    },
    destroy() {
      order.push(["destroy", "stdin"]);
    },
  };
  stdout.on = function (event, listener) {
    EventEmitter.prototype.on.call(this, event, listener);
    if (event === "data") this.emit("data", Buffer.from(`knorvia-deploy-lock-acquired:${token}`));
    return this;
  };
  stdout.destroy = () => {
    order.push(["destroy", "stdout"]);
    throw new Error("synthetic destroy failure");
  };
  stderr.destroy = () => {
    order.push(["destroy", "stderr"]);
    stderr.emit("data", Buffer.from("late"));
  };
  const stream = {
    stdin,
    stdout,
    stderr,
    onClose(listener) {
      close.on("close", listener);
      return {
        dispose() {
          close.off("close", listener);
          order.push(["unsubscribe-close"]);
        },
      };
    },
  };
  let commands = 0;
  let disposals = 0;
  const backend = {
    async exec(command) {
      assert.equal(typeof command, "string");
      commands++;
      return stream;
    },
    dispose() {
      disposals++;
    },
    async disposeAndWait() {
      disposals++;
    },
  };
  const handle = await acquireRemoteDeployLock(backend, {
    ownerToken: token,
    lockDir: "~/synthetic-lock",
    acquireTimeoutMs: 40,
    releaseTimeoutMs: 1,
  });
  const pending = handle.release();
  assert.strictEqual(handle.release(), pending);
  await assert.rejects(pending, {
    message:
      "[deploy-lock] lock-holder release timed out after 1ms (owner=synthetic-owner): before",
  });
  assert.strictEqual(handle.release(), pending);
  assert.deepEqual(order, [
    ["write", "knorvia-deploy-lock-release:synthetic-owner\n"],
    ["end"],
    ["destroy", "stdin"],
    ["destroy", "stdout"],
    ["destroy", "stderr"],
    ["unsubscribe-close"],
  ]);
  assert.equal(commands, 1);
  assert.equal(disposals, 0);
  assert.equal(stdout.listenerCount("data"), 0);
  assert.equal(stderr.listenerCount("data"), 0);
  assert.equal(close.listenerCount("close"), 0);
});
