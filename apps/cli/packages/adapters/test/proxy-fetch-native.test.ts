// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { target } from "./proxy-fetch.fixture.js";
const loader = import.meta.resolve("tsx");
async function observe(mode: string) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      loader,
      fileURLToPath(new URL("./proxy-fetch-native-child.ts", import.meta.url)),
      target,
      mode,
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  child.stdout.on("data", (data) => stdout.push(data));
  child.stderr.on("data", (data) => stderr.push(data));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 0, Buffer.concat(stderr).toString());
  assert.equal(Buffer.concat(stderr).toString(), "");
  return JSON.parse(Buffer.concat(stdout).toString()) as {
    outcome: Record<string, unknown>;
    errors: unknown[];
    requests: string[];
  };
}
for (const status of [200, 204, 205, 304])
  test(`owned native proxy returns ${status} without an escaped exception`, async () => {
    const result = await observe(String(status));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.requests, ["http://target.invalid/native-owned"]);
    assert.deepEqual(result.outcome, {
      state: "fulfilled",
      status,
      nullBody: status !== 200,
      text: status === 200 ? "owned" : "",
    });
  });
test("owned native proxy preserves body cancellation Error identity after response transfer", async () => {
  const result = await observe("body-abort");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.outcome, {
    state: "body-rejected",
    sameReason: true,
    first: "owned",
    status: 200,
  });
});
