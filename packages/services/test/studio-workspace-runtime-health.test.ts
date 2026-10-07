// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runtimeFixture, serverCommand } from "./studio-workspace-runtime-fixture.js";
import type { StoredWorkspaceRuntime } from "../src/studio-runtime/app/workspaceRuntime.js";

test(
  "setup root exit cleans its own surviving process group before reporting prepared",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = await runtimeFixture(t);
    const a = await f.add("descendants");
    const command = {
      executable: process.execPath,
      args: [
        "-e",
        `const {spawn}=require('child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('fs').writeFileSync('child-pid',String(p.pid));setTimeout(()=>process.exit(0),100);`,
      ],
    };
    await a.request({ action: "prepare", approved: true, command });
    await a.wait("prepared");
    const pid = Number(await readFile(join(a.working, "child-pid"), "utf8"));
    if (process.platform === "linux") {
      const state = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
      assert(
        !state || state.slice(state.lastIndexOf(")") + 2).startsWith("Z "),
        "owned descendant must have stopped executing",
      );
    } else assert.throws(() => process.kill(pid, 0));
  },
);

test("health loss withdraws preview and fails; exit of an owned service is not displayed as stopped", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("health");
  await a.prepare();
  await a.request({
    action: "start",
    approved: true,
    command: {
      executable: process.execPath,
      args: [
        "-e",
        "require('http').createServer((q,r)=>{r.statusCode=require('fs').existsSync('unhealthy')?503:200;r.end()}).listen(Number(process.env.PORT),process.env.HOST)",
      ],
    },
    timeoutMs: 2000,
  });
  await a.wait("ready");
  await writeFile(join(a.working, "unhealthy"), "fixture");
  const waiting = await a.wait("starting");
  assert.equal(waiting.previewUrl, undefined);
  assert.equal((await a.wait("failed")).errorCode, "readiness-failed");
  await a.request({ action: "start", approved: true, command: serverCommand });
  await a.wait("ready");
  const row = f.db.read<StoredWorkspaceRuntime>("workspace-runtime", a.key);
  assert(row?.proof);
  assert.equal(await f.io.recover(row.proof), true);
  const exited = await a.wait("failed");
  assert.equal(exited.previewUrl, undefined);
  assert.equal(exited.errorCode, "process-exited");
});

test("disposing the runtime cancels pending owned setup before shutdown completes", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("dispose");
  await a.request({
    action: "prepare",
    approved: true,
    command: { executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
  });
  await f.owner.dispose();
  assert.equal((await a.request()).phase, "stopped");
  assert.equal((await a.request()).prepared, false);
  await assert.rejects(a.request({ action: "prepare", approved: true }), /unavailable/);
});
