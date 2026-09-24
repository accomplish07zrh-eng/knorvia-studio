import assert from "node:assert/strict";
import { test } from "node:test";
import { publishKernelVersion } from "../src/studio-runtime/adapters/kernels/publishVersion.js";

test("verified Windows install publication retries only transient locks and respects cancellation", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await publishKernelVersion("stage", "version", new AbortController().signal, {
    platform: "win32",
    rename: async () => {
      if (++attempts < 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
    },
    delay: async (ms) => {
      delays.push(ms);
    },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [50, 100]);
  const controller = new AbortController();
  attempts = 0;
  await assert.rejects(
    publishKernelVersion("stage", "version", controller.signal, {
      platform: "win32",
      rename: async () => {
        attempts++;
        throw Object.assign(new Error("locked"), { code: "EBUSY" });
      },
      delay: async () => {
        controller.abort();
      },
    }),
    /abort/i,
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    publishKernelVersion("stage", "version", new AbortController().signal, {
      platform: "win32",
      rename: async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      delay: async () => {
        assert.fail("nontransient errors must not retry");
      },
    }),
    /missing/,
  );
});
