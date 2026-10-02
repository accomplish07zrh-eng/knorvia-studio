import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic snapshot denies identity races and closes bounded reads with original failure precedence", async () => {
  const trace: unknown[][] = [];
  const bytes = Buffer.from("synthetic secret");
  const denied = Object.assign(new Error("synthetic read denied"), { code: "EACCES" });
  const closeDenied = new Error("synthetic close denied");
  let mode = "race";
  const info = { isFile: () => true, nlink: 1, size: bytes.length, mtimeMs: 50, ino: 1, dev: 2 };
  mock.module("node:fs/promises", {
    namedExports: {
      realpath: async (path: string) => {
        trace.push(["realpath", path]);
        return path;
      },
      lstat: async (path: string) => {
        trace.push(["lstat", path]);
        return info;
      },
      open: async (path: string, flags: number) => {
        trace.push(["open", path, flags]);
        return {
          stat: async () => {
            trace.push(["fstat"]);
            return { ...info, ino: mode === "race" ? 9 : 1 };
          },
          read: async (target: Buffer, offset: number, length: number, position: number) => {
            trace.push(["read", offset, length, position]);
            if (mode === "read-denied" || mode === "close-denied") throw denied;
            const count = Math.min(3, length);
            bytes.copy(target, offset, position, position + count);
            return { bytesRead: count };
          },
          close: async () => {
            trace.push(["close"]);
            if (mode === "close-denied") throw closeDenied;
          },
        };
      },
    },
  });
  mock.module("@knorvia/shared", {
    namedExports: {
      redactFeedbackText: (text: string, options: unknown) => {
        trace.push(["redact", text, options]);
        return "synthetic redacted";
      },
    },
  });
  const { feedbackArchiveSnapshot } = await import("../src/feedback/feedbackArchiveSnapshot.js");
  const candidate = { path: "/synthetic/input.log", name: "logs/input.log" };
  const window = { start: 0, end: 100, budget: 1000 };
  assert.deepEqual(await feedbackArchiveSnapshot(candidate, 0, window), {
    kind: "skipped",
    reason: "opened-file-policy",
  });
  assert.equal(
    trace.some(([operation]) => operation === "read" || operation === "redact"),
    false,
  );
  assert.deepEqual(trace.at(-1), ["close"]);
  mode = "success";
  trace.length = 0;
  const result = await feedbackArchiveSnapshot(candidate, 0, window);
  assert.deepEqual(result, {
    kind: "included",
    entry: { name: candidate.name, data: Buffer.from("synthetic redacted") },
    cost: Buffer.byteLength("synthetic redacted"),
  });
  assert.deepEqual(
    trace.filter(([operation]) => operation === "read"),
    [
      ["read", 0, 16, 0],
      ["read", 3, 13, 3],
      ["read", 6, 10, 6],
      ["read", 9, 7, 9],
      ["read", 12, 4, 12],
      ["read", 15, 1, 15],
    ],
  );
  assert.deepEqual(trace.slice(-2), [
    ["redact", "synthetic secret", { diagnostic: true }],
    ["close"],
  ]);
  mode = "read-denied";
  trace.length = 0;
  await assert.rejects(feedbackArchiveSnapshot(candidate, 0, window), (e) => e === denied);
  assert.deepEqual(trace.at(-1), ["close"]);
  mode = "close-denied";
  await assert.rejects(feedbackArchiveSnapshot(candidate, 0, window), (e) => e === closeDenied);
});
