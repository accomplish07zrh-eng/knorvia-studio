import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOnboardingRecord,
  startOnboardingCheck,
} from "../src/onboarding/useOnboardingTrigger.js";

const entry = {
  occupation: "developer",
  interfaceMode: "coding" as const,
  memoryEnabled: false,
  proactiveSuggestionsEnabled: false,
  completedAt: "2026-09-23T00:00:00.000Z",
};

test("saved occupation skips the optional record RPC and never reopens onboarding", () => {
  let calls = 0;
  const results: boolean[] = [];
  startOnboardingCheck({
    hasStoredOccupation: true,
    check: async () => {
      calls++;
      return true;
    },
    onResult: (value) => results.push(value),
    onError: assert.fail,
  });
  assert.equal(calls, 0);
  assert.deepEqual(results, [false]);
});

test("completing onboarding cancels a pending result that would have reopened it", async () => {
  let resolve!: (value: boolean) => void;
  let needed = true;
  const pending = new Promise<boolean>((done) => {
    resolve = done;
  });
  const cancel = startOnboardingCheck({
    hasStoredOccupation: false,
    check: () => pending,
    onResult: (value) => {
      needed = value;
    },
    onError: assert.fail,
  });
  await Promise.resolve();
  cancel();
  needed = false;
  resolve(true);
  await pending;
  await Promise.resolve();
  assert.equal(needed, false);
});

test("replaced or unmounted checks neither start a new RPC nor report late failures", async () => {
  let calls = 0;
  const cancel = startOnboardingCheck({
    hasStoredOccupation: false,
    check: async () => {
      calls++;
      throw new Error("old connection");
    },
    onResult: assert.fail,
    onError: assert.fail,
  });
  cancel();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 0);
});

test("missing record service and a failed check allow a new user to finish onboarding", async () => {
  const results: boolean[] = [];
  startOnboardingCheck({
    hasStoredOccupation: false,
    onResult: (value) => results.push(value),
    onError: assert.fail,
  });
  let reported = 0;
  const cancel = startOnboardingCheck({
    hasStoredOccupation: false,
    check: () => Promise.reject(new Error("offline")),
    onResult: (value) => results.push(value),
    onError: () => {
      reported++;
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(results, [true, true]);
  assert.equal(reported, 1);
  cancel();
});

test("record success and failure always clear their timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  await appendOnboardingRecord({ appendRecord: async () => {} }, "fixture-device", entry);
  assert.equal(clear.mock.calls.length, 1);
  await assert.rejects(
    appendOnboardingRecord(
      {
        appendRecord: async () => {
          throw new Error("write failed");
        },
      },
      "fixture-device",
      entry,
    ),
    /write failed/,
  );
  assert.equal(clear.mock.calls.length, 2);
});

test("a hanging optional record times out at five seconds and clears the timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const clear = t.mock.method(globalThis, "clearTimeout");
  const pending = appendOnboardingRecord(
    { appendRecord: () => new Promise<void>(() => {}) },
    "fixture-device",
    entry,
  );
  const rejected = assert.rejects(pending, /appendRecord timeout/);
  t.mock.timers.tick(5000);
  await rejected;
  assert.equal(clear.mock.calls.length, 1);
});
