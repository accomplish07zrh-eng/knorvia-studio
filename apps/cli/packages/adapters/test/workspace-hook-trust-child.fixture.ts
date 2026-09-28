// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createFileWorkspaceHookTrustStore } from "./workspace-hook-trust-test-api.js";
import { record } from "./workspace-hook-trust.fixture.js";

const mode = process.argv[2];
const path = process.argv[3];
assert.ok(path);
const boundary = dirname(fileURLToPath(import.meta.url));
const within = relative(boundary, resolve(path));
assert.ok(within && !within.startsWith("..") && !isAbsolute(within));
assert.ok(mode === "idle" || mode === "writer");
assert.equal(process.version, "v24.14.0");
let resume!: () => void;
const released = new Promise<void>((resolveRelease) => {
  resume = resolveRelease;
});
const deadline = setTimeout(() => {
  process.exitCode = 124;
  resume();
}, 10000);
process.on("message", (message) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "release"
  )
    resume();
});
function send(value: object): Promise<void> {
  return new Promise((accept, reject) => {
    assert.ok(process.send);
    process.send(value, (error) => (error ? reject(error) : accept()));
  });
}
async function ready(): Promise<void> {
  await send({ type: "ready", pid: process.pid, startTime: performance.timeOrigin });
  await released;
  if (process.exitCode === 124) throw new Error("owned child deadline exceeded");
}
try {
  if (mode === "idle") await ready();
  else {
    const store = createFileWorkspaceHookTrustStore({ filePath: path, beforeRename: ready });
    await store.grant([record("1")]);
  }
} catch (error) {
  process.exitCode = 1;
  await send({ type: "failure", message: error instanceof Error ? error.message : String(error) });
} finally {
  clearTimeout(deadline);
  if (process.connected) process.disconnect?.();
}
