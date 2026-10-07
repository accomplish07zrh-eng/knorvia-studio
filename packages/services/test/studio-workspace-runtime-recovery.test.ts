// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWorkspaceRuntimePort } from "../src/studio-runtime/adapters/workspaceRuntimeProcess.js";
import type { StoredWorkspaceRuntime } from "../src/studio-runtime/app/workspaceRuntime.js";
import { runtimeFixture, serverCommand } from "./studio-workspace-runtime-fixture.js";

test("Host restart exposes interruption and recovers only persisted owned identities", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("restart");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./studio-workspace-runtime-crash-fixture.ts", import.meta.url)),
      f.path,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0, error);
  const ready = JSON.parse(output);
  const proof = f.db.read<StoredWorkspaceRuntime>("workspace-runtime", a.key)?.proof;
  assert(proof?.identities.length);
  t.after(() => f.io.recover(proof));
  assert.equal(await (await fetch(ready.previewUrl)).text(), "runtime fixture");
  const interrupted = await a.request();
  assert.equal(interrupted.phase, "interrupted");
  assert.equal(interrupted.previewUrl, undefined);
  await assert.rejects(
    a.request({ action: "start", approved: true, command: serverCommand }),
    /interrupted/,
  );
  await a.request({ action: "recover" });
  assert.equal((await a.request()).phase, "stopped");
  await assert.rejects(fetch(ready.previewUrl, { signal: AbortSignal.timeout(1000) }));
});

test("a mismatched process birth token never kills a reused PID or unrelated process", async (t) => {
  const io = createWorkspaceRuntimePort();
  const process = await io.spawn(
    fileURLToPath(new URL(".", import.meta.url)),
    // 修复：身份核验需要持续存活的进程；未分配端口时 HTTP fixture 会立即退出。
    { executable: globalThis.process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
    undefined,
    () => {},
  );
  t.after(() => process.stop());
  const proof = await process.proof();
  assert(proof.identities.length);
  const mismatched = {
    ...proof,
    identities: proof.identities.map((identity) => ({ ...identity, startToken: "0".repeat(64) })),
  };
  assert.equal(
    await io.recover(mismatched),
    true,
    "mismatched identities are outside this feature's cleanup scope",
  );
  assert.equal(process.alive(), true);
  assert.equal(
    await io.recover({ rootPid: proof.rootPid, identities: [] }),
    false,
    "a live PID without identity must remain unconfirmed",
  );
  assert.equal(process.alive(), true);
});
