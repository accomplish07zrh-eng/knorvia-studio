import assert from "node:assert/strict";
import { constants } from "node:fs";
import { mock, test } from "node:test";

test("synthetic memory handle validates before bounded reads and closes on authority failure", async () => {
  const trace: unknown[][] = [];
  const denied = new Error("synthetic validation denied");
  const closeDenied = new Error("synthetic close denied");
  let mode = "plain";
  let stats = 0;
  const snapshot = () => ({
    dev: 1n,
    ino: 2n,
    size: mode === "oversized" ? 5242881n : 3n,
    mtimeNs: 23000000n,
    ctimeNs: 7n,
    isFile: () => true,
    isSymbolicLink: () => false,
  });
  mock.module("node:fs/promises", {
    namedExports: {
      lstat: async (...args: unknown[]) => {
        trace.push(["lstat", ...args]);
        return snapshot();
      },
      open: async (...args: unknown[]) => {
        trace.push(["open", ...args]);
        stats = 0;
        return {
          stat: async (...args: unknown[]) => {
            trace.push(["stat", ...args]);
            stats++;
            return { ...snapshot(), ino: mode === "changed" && stats === 2 ? 3n : 2n };
          },
          read: async (buffer: Buffer, offset: number, length: number, position: number) => {
            trace.push(["read", offset, length, position]);
            if (offset === 0) {
              buffer.write("abc");
              return { bytesRead: 3 };
            }
            return { bytesRead: 0 };
          },
          close: async () => {
            trace.push(["close"]);
            if (mode === "close") throw closeDenied;
          },
        };
      },
    },
  });
  const { readProjectMemoryFileFromStableHandle: read } =
    await import("../src/memory/projectMemoryStableRead.js");
  const params = {
    fileName: "MEMORY.md",
    filePath: "/synthetic/MEMORY.md",
    validatePath: async () => {
      trace.push(["validate"]);
      if (mode === "denied" || mode === "close") throw denied;
    },
  };
  assert.deepEqual(await read(params), { content: "abc", updatedAt: 23 });
  assert.deepEqual(
    trace.map((v) => v[0]),
    ["lstat", "open", "stat", "validate", "lstat", "read", "read", "stat", "close"],
  );
  assert.equal(
    trace[1][2],
    constants.O_RDONLY | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0),
  );
  assert.deepEqual(trace[5], ["read", 0, 5242881, 0]);
  for (const next of ["denied", "close", "oversized", "changed"]) {
    trace.length = 0;
    mode = next;
    await assert.rejects(read(params), (e) =>
      next === "denied"
        ? e === denied
        : next === "close"
          ? e === closeDenied
          : !!e &&
            typeof e === "object" &&
            "code" in e &&
            e.code ===
              (next === "changed"
                ? "PROJECT_MEMORY_FILE_CHANGED"
                : "PROJECT_MEMORY_PREVIEW_LIMIT_EXCEEDED"),
    );
    assert.equal(trace.at(-1)?.[0], "close");
    if (next !== "changed") assert.ok(!trace.some((v) => v[0] === "read"));
  }
});
