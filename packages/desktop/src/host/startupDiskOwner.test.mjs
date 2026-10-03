import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { load, plain, defer } from "./storageOwnerTestPorts.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("disk sampler synthetic probe authority, migration and stopped lifetime", async () => {
  let clock = 10;
  const timers = [],
    clears = [],
    samples = [],
    requests = [];
  let sampler;
  const pending = new Map();
  const options = {
    probe: function (path) {
      assert.equal(this, sampler);
      requests.push(path);
      return (
        pending.get(path)?.promise ?? Promise.resolve({ scope: "scope-a", availableBytes: 100 })
      );
    },
    onSample: function (value) {
      assert.equal(this, options);
      samples.push(plain(value));
    },
  };
  const api = load(
    "disk",
    {},
    {
      Date: { now: () => clock++ },
      setInterval(callback, delay) {
        timers.push({ callback, delay });
        return timers.length === 1 ? 0 : timers.length;
      },
      clearInterval(token) {
        clears.push(token);
      },
    },
  );
  sampler = new api.StartupDiskSampler(options);
  const slow = defer();
  pending.set("/synthetic/slow", slow);
  const first = sampler.addPath("/synthetic/slow");
  await sampler.addPath("/synthetic/busy");
  assert.deepEqual(requests, ["/synthetic/slow"]);
  assert.deepEqual(
    plain(sampler.snapshot()).map((row) => [row.scopeId, row.quality]),
    [
      [hash("/synthetic/slow"), "unknown"],
      [hash("/synthetic/busy"), "unknown"],
    ],
  );
  sampler.sealBaseline("/synthetic/slow");
  slow.resolve({ scope: "scope-a", availableBytes: 100 });
  await first;
  const partial = sampler.snapshot().find((row) => row.scopeId === "scope-a");
  assert.equal(partial.quality, "partial");
  assert.equal(partial.observedAvailableDropPeakBytes, null);
  assert.deepEqual(Object.keys(partial), [
    "scopeId",
    "observedAvailableDropPeakBytes",
    "minAvailableBytes",
    "quality",
    "sampledAt",
  ]);
  partial.minAvailableBytes = -99;
  assert.equal(sampler.snapshot().find((row) => row.scopeId === "scope-a").minAvailableBytes, 100);
  pending.delete("/synthetic/slow");
  options.probe = () => {
    assert.fail("probe captured at construction");
  };
  await sampler.addPath("/synthetic/alias");
  assert.equal(sampler.snapshot().filter((row) => row.scopeId === "scope-a").length, 1);
  assert.equal(samples.length, 0);
  sampler.start();
  sampler.start();
  assert.equal(timers.length, 2);
  assert.deepEqual(
    timers.map((row) => row.delay),
    [2000, 2000],
  );
  const sampling = defer();
  pending.set("/synthetic/slow", sampling);
  const sample = sampler.sample();
  await sampler.addPath("/synthetic/late");
  assert.equal(requests.at(-1), "/synthetic/slow");
  sampler.stop();
  sampling.resolve({ scope: "different-after-stop", availableBytes: 1 });
  await sample;
  assert.equal(samples.length, 0);
  assert.ok(sampler.snapshot().some((row) => row.scopeId === hash("/synthetic/late")));
  assert.ok(sampler.snapshot().some((row) => row.scopeId === "scope-a"));
  sampler.stop();
  sampler.start();
  assert.deepEqual(clears, [2, 2]);
  assert.equal(timers.length, 2);
  await sampler.addPath("/synthetic/stopped");
  assert.equal(requests.includes("/synthetic/stopped"), false);

  let next = { scope: "complete-a", availableBytes: 80 };
  let active;
  active = new api.StartupDiskSampler({
    probe: async function () {
      assert.equal(this, active);
      return next;
    },
    onSample(value) {
      samples.push(plain(value));
    },
  });
  await active.addPath("/synthetic/complete");
  next = { scope: "complete-a", availableBytes: 70 };
  await active.sample();
  assert.equal(active.snapshot()[0].observedAvailableDropPeakBytes, 10);
  next = { scope: "migrated-b", availableBytes: 60 };
  await active.sample();
  assert.equal(active.snapshot()[0].scopeId, "migrated-b");
  assert.equal(active.snapshot()[0].quality, "partial");
  assert.equal(active.snapshot()[0].observedAvailableDropPeakBytes, 20);
  next = {
    get scope() {
      throw new Error("probe getter");
    },
    availableBytes: 0,
  };
  await active.sample();
  assert.equal(active.snapshot()[0].quality, "partial");
  const callbackFailure = new Error("callback identity");
  let busy;
  busy = new api.StartupDiskSampler({
    probe: async () => ({ scope: "callback", availableBytes: 3 }),
    onSample() {
      throw callbackFailure;
    },
  });
  await busy.addPath("/synthetic/callback");
  await assert.rejects(busy.sample(), (error) => error === callbackFailure);
  await assert.rejects(busy.sample(), (error) => error === callbackFailure);
  const cap = new api.StartupDiskSampler({
    probe: async (path) => ({ scope: path, availableBytes: 1 }),
  });
  for (let i = 0; i < 9; i++) await cap.addPath("/synthetic/cap" + i);
  assert.equal(cap.snapshot().length, 8);

  const metadata = [],
    space = [];
  let bytes = 12n;
  const fsPorts = {
    async stat(path, options) {
      metadata.push([path, options.bigint]);
      if (path === "/synthetic/missing") {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
      return { dev: 17n };
    },
    async statfs(path, options) {
      space.push([path, options.bigint]);
      return { bavail: bytes, bsize: 2n };
    },
  };
  const defaults = load(
    "disk",
    { fs: fsPorts },
    {
      Date: { now: () => 20 },
      setInterval() {
        return 1;
      },
      clearInterval() {},
    },
  );
  const defaultSampler = new defaults.StartupDiskSampler();
  await defaultSampler.addPath("/synthetic/missing/data");
  assert.equal(defaultSampler.snapshot()[0].scopeId, hash("17"));
  assert.equal(defaultSampler.snapshot()[0].minAvailableBytes, 24);
  bytes = -1n;
  await defaultSampler.sample();
  assert.equal(defaultSampler.snapshot()[0].minAvailableBytes, 0);
  assert.deepEqual(metadata, [
    ["/synthetic/missing", true],
    ["/synthetic", true],
  ]);
  assert.equal(space.length, 2);
  bytes = BigInt(Number.MAX_SAFE_INTEGER);
  await defaultSampler.sample();
  assert.equal(defaultSampler.snapshot()[0].quality, "partial");
  assert.equal(metadata.length, 2);
});
