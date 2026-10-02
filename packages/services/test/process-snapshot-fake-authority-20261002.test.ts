import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ChildProcess } from "node:child_process";

test("synthetic snapshots deny missing or reused root identities and avoid unrelated proc reads", async () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "linux" });
  let mode = "normal";
  const reads: string[] = [];
  const row = (pid: number, parent: number, group: number) =>
    `${pid} ${parent} ${group} Mon Jan 1 00:00:00 2024`;
  mock.module("node:child_process", {
    namedExports: {
      spawnSync: (command: string, args: unknown, options: unknown) => {
        assert.equal(command, "ps");
        assert.deepEqual(args, ["-eo", "pid=,ppid=,pgid=,lstart="]);
        assert.deepEqual(options, { encoding: "utf8", timeout: 1000 });
        return {
          status: 0,
          stdout: [
            mode === "missing" ? "" : row(501, 0, 501),
            row(502, 0, 501),
            row(999, 0, 999),
          ].join("\n"),
        };
      },
    },
  });
  mock.module("node:fs", {
    namedExports: {
      readFileSync: (path: string, encoding: string) => {
        reads.push(path);
        assert.equal(encoding, "utf8");
        assert.ok(path === "/proc/501/stat" || path === "/proc/502/stat");
        const fields = Array<string>(20).fill("0");
        fields[0] = "S";
        fields[1] = "0";
        fields[2] = "501";
        fields[19] = path === "/proc/501/stat" && mode === "reused" ? "200" : "100";
        return `0 (synthetic (command)) ${fields.join(" ")}`;
      },
    },
  });
  try {
    const { captureProcessTreeSnapshot, filterCurrentProcessIdentities } =
      await import("../src/process/processTreeSnapshot.js");
    const child = { pid: 501 } as ChildProcess;
    const snapshot = captureProcessTreeSnapshot(child);
    assert.ok(snapshot);
    assert.deepEqual(snapshot.descendantPids, [502]);
    assert.deepEqual(reads, ["/proc/501/stat", "/proc/502/stat"]);
    const root = snapshot.identities[0];
    assert.ok(root);
    mode = "reused";
    reads.length = 0;
    assert.deepEqual(filterCurrentProcessIdentities([root], {}), []);
    assert.deepEqual(reads, ["/proc/501/stat"]);
    mode = "missing";
    reads.length = 0;
    assert.equal(captureProcessTreeSnapshot(child), undefined);
    assert.deepEqual(reads, []);
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
  }
});
