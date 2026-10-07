// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import {
  StudioWorkspaceRuntime,
  type StoredWorkspaceRuntime,
} from "../src/studio-runtime/app/workspaceRuntime.js";
import {
  runtimeFixture,
  runtimeClock,
  runtimeHost,
  serverCommand,
} from "./studio-workspace-runtime-fixture.js";
import type { StudioWorkspaceRuntimeControl } from "../src/studio-runtime/workspaceRuntimeTypes.js";
import { workspaceLocation } from "../src/studio-runtime/adapters/workspaceSnapshot.js";
import { digest } from "../src/studio-runtime/adapters/workspaceFiles.js";

test("parallel non-git snapshots own distinct loopback ports and stop independently without overwriting dirty source", async (t) => {
  const f = await runtimeFixture(t);
  const [a, b] = await Promise.all([f.add("a"), f.add("b")]);
  const [one, two] = await Promise.all([a.start(), b.start()]);
  assert.notEqual(one.port, two.port);
  assert.match(one.previewUrl!, /^http:\/\/127\.0\.0\.1:/);
  assert.equal(await (await fetch(one.previewUrl!)).text(), "runtime fixture");
  await a.request({ action: "stop" });
  assert.equal((await a.request()).phase, "stopped");
  assert.equal((await a.request()).previewUrl, undefined);
  assert.equal((await b.request()).phase, "ready");
  assert.equal(await (await fetch(two.previewUrl!)).text(), "runtime fixture");
  assert.equal(await readFile(join(f.source, "dirty.txt"), "utf8"), "uncommitted source");
  assert.equal(f.db.list("workspace-runtime", { all: true }).length, 2);
});

test("explicit setup prepares dependencies in the snapshot; failure blocks start and a later prepare can retry", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("setup");
  await a.request({
    action: "prepare",
    approved: true,
    command: {
      executable: process.execPath,
      args: ["-e", "process.stdout.write('synthetic-sensitive-output');process.exit(7)"],
    },
  });
  const failed = await a.wait("failed");
  assert.equal(failed.errorCode, "setup-failed");
  assert.equal(failed.exitCode, 7);
  await assert.rejects(
    a.request({ action: "start", approved: true, command: serverCommand }),
    /setup-required/,
  );
  await a.request({ action: "stop" });
  assert.equal(
    (await a.request()).phase,
    "failed",
    "stop cannot relabel a failed command as stopped",
  );
  await a.request({
    action: "prepare",
    approved: true,
    command: {
      executable: process.execPath,
      args: [
        "-e",
        "require('fs').mkdirSync('node_modules');require('fs').writeFileSync('node_modules/prepared','yes')",
      ],
    },
  });
  await a.wait("prepared");
  assert.equal(await readFile(join(a.working, "node_modules/prepared"), "utf8"), "yes");
  await assert.rejects(stat(join(f.source, "node_modules")), { code: "ENOENT" });
  const rows = JSON.stringify(f.db.list("workspace-runtime", { all: true }));
  assert(!rows.includes("synthetic-sensitive-output"));
  assert(!rows.includes("mkdirSync"));
  assert(!rows.includes("executable"));
});

test("cancel an owned setup, reject repeated window admission, and keep source apply hash checks", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("cancel");
  const other = new StudioWorkspaceRuntime({
    db: f.db,
    clock: runtimeClock,
    host: runtimeHost,
    io: f.io,
    changed() {},
  });
  t.after(() => other.dispose());
  await a.request({
    action: "prepare",
    approved: true,
    command: { executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
  });
  while (!f.db.read<StoredWorkspaceRuntime>("workspace-runtime", a.key)?.proof) await sleep(10);
  await assert.rejects(
    other.request({
      runId: "cancel",
      stepId: "step",
      control: { action: "prepare", approved: true },
    }),
    /busy/,
  );
  assert.equal((await other.request({ runId: "cancel", stepId: "step" })).canControl, false);
  await a.request({ action: "stop" });
  assert.equal((await a.request()).phase, "stopped");
  assert.equal((await a.request()).prepared, false);
  await writeFile(join(a.working, "dirty.txt"), "runtime project edit");
  await writeFile(join(f.source, "dirty.txt"), "user changed source");
  await assert.rejects(
    f.workspaces.apply("cancel", "knorvia", ["dirty.txt"]),
    /changed since isolation/,
  );
  assert.equal(await readFile(join(f.source, "dirty.txt"), "utf8"), "user changed source");
});

test("approval, read-only permission and remote ownership fail before spawning", async (t) => {
  let spawned = 0;
  const f = await runtimeFixture(t, {
    spawn: async () => {
      spawned++;
      throw new Error("unexpected");
    },
  });
  const a = await f.add("policy");
  await assert.rejects(
    a.request({ action: "prepare", approved: false } as unknown as StudioWorkspaceRuntimeControl),
    /approval-required/,
  );
  f.db.transaction(() =>
    f.db.write("config", "knorvia", { executablePath: "", permission: "read-only" }),
  );
  await assert.rejects(a.request({ action: "prepare", approved: true }), /read-only/);
  f.db.transaction(() =>
    f.db.write("workspace", "policy:step", {
      runId: "policy",
      stepId: "knorvia",
      path: a.working,
      sourcePath: f.source,
      remoteKernelId: "ssh:fixture:knorvia",
    }),
  );
  await assert.rejects(a.request(), /unavailable/);
  assert.equal(spawned, 0);
});

test("spawn failure and readiness timeout remain failures after owned cleanup", async (t) => {
  const f = await runtimeFixture(t);
  const a = await f.add("failure");
  await a.prepare();
  await a.request({
    action: "start",
    approved: true,
    command: { executable: join(f.root, "missing-executable"), args: [] },
  });
  assert.equal((await a.wait("failed")).errorCode, "spawn-failed");
  await a.request({
    action: "start",
    approved: true,
    command: { executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
    timeoutMs: 100,
  });
  const timeout = await a.wait("failed");
  assert.equal(timeout.errorCode, "readiness-failed");
  assert.equal(timeout.previewUrl, undefined);
  assert.equal(timeout.port, undefined);
});

test("a stolen port fails honestly and never stops the unrelated listener", async (t) => {
  const listener = createServer((_q, r) => r.end("unrelated"));
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => listener.close(() => resolve())));
  const address = listener.address();
  assert(address && typeof address !== "string");
  const f = await runtimeFixture(t, {
    reservePort: async () => ({ port: address.port, release: async () => {} }),
  });
  const a = await f.add("conflict");
  await a.prepare();
  await a.request({ action: "start", approved: true, command: serverCommand, timeoutMs: 2000 });
  const failed = await a.wait("failed");
  assert.equal(failed.errorCode, "port-conflict");
  assert.equal(await (await fetch(`http://127.0.0.1:${address.port}`)).text(), "unrelated");
});

test("cleanup failure remains cleanup-required and explicit retry can recover", async (t) => {
  let recovered = false;
  const f = await runtimeFixture(t, {
    spawn: async (_path, _command, _port, created) => {
      const proof = { rootPid: 1, identities: [] };
      created(proof);
      return {
        proof: async () => proof,
        alive: () => false,
        exited: Promise.resolve({ code: 4, conflict: false }),
        stop: async () => false,
      };
    },
    recover: async () => recovered,
  });
  const a = await f.add("cleanup");
  await a.request({ action: "prepare", approved: true, command: serverCommand });
  const failure = await a.wait("cleanup-required");
  assert.equal(failure.errorCode, "cleanup-required");
  await a.request({ action: "stop" });
  assert.equal((await a.request()).phase, "cleanup-required");
  recovered = true;
  await a.request({ action: "recover" });
  assert.equal((await a.request()).phase, "stopped");
});

test("known secrets are neither seeded nor published, including credential entries in old baselines", async (t) => {
  const f = await runtimeFixture(t);
  await writeFile(join(f.source, ".env"), "synthetic-only");
  await writeFile(join(f.source, ".env.example"), "EXAMPLE=value");
  await mkdir(join(f.source, ".ssh"));
  await writeFile(join(f.source, ".ssh/id_ed25519"), "synthetic-only");
  const a = await f.add("secrets");
  await assert.rejects(stat(join(a.working, ".env")), { code: "ENOENT" });
  await assert.rejects(stat(join(a.working, ".ssh")), { code: "ENOENT" });
  assert.equal(await readFile(join(a.working, ".env.example"), "utf8"), "EXAMPLE=value");
  await writeFile(join(a.working, ".env"), "runtime-generated");
  const location = workspaceLocation(join(f.root, "data"), "secrets", "knorvia");
  const metadata = JSON.parse(await readFile(location.metadata, "utf8"));
  metadata.baseline[".env"] = { hash: digest("synthetic-only"), size: 14, mode: 0o600 };
  await writeFile(join(location.baseline, ".env"), "synthetic-only");
  await writeFile(location.metadata, JSON.stringify(metadata));
  assert.deepEqual(await f.workspaces.changes("secrets", "knorvia"), []);
  await assert.rejects(f.workspaces.apply("secrets", "knorvia", [".env"]), /Credential files/);
  assert.equal(await readFile(join(f.source, ".env"), "utf8"), "synthetic-only");
});
