// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { entryLabel, examplePath, repoRoot } from "./entry.mjs";

// 示例固定 import ../src/index.js，dist 入口不重跑（known-differences §4）。
const examples = [
  {
    name: "01-basic-ipc",
    expected: [
      "--- Basic IPC Demo ---",
      "add(10, 20) = 30",
      "multiply(6, 7) = 42",
      "divide(100, 3) = 33.333",
      "divide(1, 0) → Error: Division by zero",
      "Done!",
    ],
  },
  {
    name: "02-proxy-channel",
    expected: [
      "--- ProxyChannel Demo ---",
      'readFile(\'/src/main.ts\') = "console.log("hello world")"',
      "listFiles('/src')",
      "readFile('/nonexistent') → Error: File not found: /nonexistent",
      "Done!",
    ],
  },
  {
    name: "03-ipc-server-client",
    expected: [
      "--- IPCServer + IPCClient Demo ---",
      '[1] Client "window-1" connecting...',
      'client1: set theme = "dark"',
      'client2: get theme = "dark"',
      'server → window-1: title = "Window window-1"',
      "Active connections: 2",
      "Active connections after disconnect: 1",
      "Done!",
    ],
  },
  {
    name: "04-remote-connection",
    expected: [
      "=== Remote connection Demo ===",
      '[SSH Resolver] Resolving "ssh+myserver" → 192.168.1.100:8080',
      'readFile → "console.log("Hello from remote!")"',
      "stat → size:",
      'readFile after write → "console.log("Updated from local VS Code!")"',
      "Done!",
    ],
  },
];

for (const example of examples) {
  test(`B19 示例 ${example.name}`, { skip: entryLabel !== "src" }, () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", examplePath(example.name)], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    assert.equal(
      result.status,
      0,
      `示例退出码 ${result.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
    for (const line of example.expected) {
      assert.ok(stdout.includes(line), `stdout 缺少 "${line}"\n实际:\n${stdout}`);
    }
  });
}
