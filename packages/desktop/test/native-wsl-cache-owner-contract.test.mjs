import assert from "node:assert/strict";
import test from "node:test";
import { deferred, flush, loadNativeOwner } from "./native-owner-fixture.mjs";

// Authored and unrun. WSLBackend and clock are supplied; no WSL discovery,
// subprocess, remote identity/credentials or actual connection is executed.
function ports() {
  const state = { clock: 0, backends: [], now: () => state.clock };
  state.Backend = class {
    constructor(target) {
      this.target = target;
      this.result = deferred();
      this.disposals = 0;
      state.backends.push(this);
    }
    resolveIdentity() {
      return this.result.promise;
    }
    dispose() {
      this.disposals++;
      if (this.failure) throw this.failure;
    }
  };
  return state;
}
const modules = {
  "@knorvia/server/remote/wsl-backend.js": "export const WSLBackend = port.Backend;",
};
const clock = "const Date = {now:nativeFixture.now};";

test("WSL resolver returns the same fresh Promise, defers backend creation and keeps the original live target", async () => {
  const state = ports();
  const { resolveCanonicalWslTarget: resolveTarget } = await loadNativeOwner(
    "desktopWslTargetResolver",
    state,
    modules,
    clock,
  );
  const target = { kind: "wsl", distro: " Ubuntu ", user: " root " };
  const first = resolveTarget(target);
  const same = resolveTarget({ kind: "wsl", distro: "ubuntu", user: "root" });
  assert.equal(first, same);
  assert.equal(state.backends.length, 0);
  target.distro = "live-after-call";
  await flush();
  assert.equal(state.backends[0].target, target);
  assert.equal(state.backends[0].target.distro, "live-after-call");
  const identity = { distro: "Canonical-Ubuntu", user: "root" };
  state.backends[0].result.resolve(identity);
  const result = await first;
  assert.deepEqual(result, { kind: "wsl", distro: identity.distro, user: identity.user });
  assert.notEqual(result, identity);
  assert.equal(state.backends[0].disposals, 1);
  state.clock = 4999;
  assert.equal(resolveTarget({ kind: "wsl", distro: "UBUNTU", user: "root" }), first);
  state.clock = 5000;
  const replacement = resolveTarget({ kind: "wsl", distro: "Ubuntu", user: "root" });
  assert.notEqual(replacement, first);
  await flush();
  state.backends[1].result.resolve(identity);
  await replacement;
});

test("late failure of an expired WSL entry does not retire the newer pending owner", async () => {
  const state = ports();
  const { resolveCanonicalWslTarget: resolveTarget } = await loadNativeOwner(
    "desktopWslTargetResolver",
    state,
    modules,
    clock,
  );
  const target = { kind: "wsl" };
  const original = new Error("fixture old failure");
  const old = resolveTarget(target);
  const rejected = old.catch((error) => error);
  await flush();
  state.clock = 5000;
  const current = resolveTarget(target);
  await flush();
  state.backends[0].result.reject(original);
  assert.equal(await rejected, original);
  await flush();
  assert.equal(resolveTarget(target), current);
  state.backends[1].result.resolve({ distro: "fixture", user: "user" });
  await current;
  assert.equal(state.backends[0].disposals, 1);
  assert.equal(state.backends[1].disposals, 1);
});

test("backend disposal failure overrides resolution and retires the failed cache for a fresh retry", async () => {
  const state = ports();
  const { resolveCanonicalWslTarget: resolveTarget } = await loadNativeOwner(
    "desktopWslTargetResolver",
    state,
    modules,
    clock,
  );
  const target = { kind: "wsl", distro: "fixture", user: "User" };
  const failure = new Error("fixture dispose failure");
  const first = resolveTarget(target);
  const rejected = first.catch((error) => error);
  await flush();
  state.backends[0].failure = failure;
  state.backends[0].result.resolve({ distro: "fixture", user: "User" });
  assert.equal(await rejected, failure);
  await flush();
  const retry = resolveTarget(target);
  assert.notEqual(retry, first);
  await flush();
  state.backends[1].result.resolve({ distro: "fixture", user: "User" });
  await retry;
  const lowerUser = resolveTarget({ ...target, user: "user" });
  assert.notEqual(lowerUser, retry);
  await flush();
  state.backends[2].result.resolve({ distro: "fixture", user: "user" });
  await lowerUser;
});
