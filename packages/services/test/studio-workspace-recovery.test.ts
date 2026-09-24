import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { PathLike } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { createStudioWorkspaceManager } from "../src/studio-runtime/adapters/workspaceManager.js";
import { digest } from "../src/studio-runtime/adapters/workspaceFiles.js";
import {
  withWorkspaceLock,
  workspaceProcessState,
} from "../src/studio-runtime/adapters/workspaceLocks.js";
import { workspaceLocation } from "../src/studio-runtime/adapters/workspaceSnapshot.js";
import {
  contentHash,
  type JournalChange,
  type WorkspaceJournal,
} from "../src/studio-runtime/adapters/workspaceJournal.js";

const read = (path: string) =>
  fs.readFile(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  const pid = child.pid!;
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
  assert.equal(workspaceProcessState(pid), "dead");
  return pid;
}
async function ownerRecord(data: string, key: string, pid: number) {
  const token = randomUUID();
  const path = join(data, "workspace-locks", `${digest(key)}.${pid}.${token}.json`);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify({ version: 1, pid, token }));
  return path;
}
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(join(tmpdir(), "knorvia-workspace-recovery-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = join(root, "project");
  const data = join(root, "data");
  await fs.mkdir(source);
  for (const name of ["a.txt", "b.txt"]) await fs.writeFile(join(source, name), `before ${name}`);
  const manager = createStudioWorkspaceManager(data);
  const working = await manager.prepare({
    runId: "run",
    stepId: "step",
    sourcePath: source,
    mode: "isolated",
  });
  for (const name of ["a.txt", "b.txt"]) await fs.writeFile(join(working, name), `after ${name}`);
  const location = workspaceLocation(data, "run", "step");
  return { root, source, data, manager, working, location };
}
async function interrupted(
  f: Awaited<ReturnType<typeof fixture>>,
  paths = ["a.txt", "b.txt"],
  state: WorkspaceJournal["state"] = "applying",
) {
  const id = randomUUID();
  const changes: JournalChange[] = [];
  for (const [index, path] of paths.entries()) {
    const destination = join(f.source, path);
    const prefix = join(dirname(destination), `.knorvia-apply-${id}-${index}`);
    const before = await read(join(f.location.baseline, path));
    const after = await read(join(f.working, path));
    changes.push({
      path,
      beforeHash: contentHash(before),
      afterHash: contentHash(after),
      mode: 0o644,
      destination,
      staging: `${prefix}.tmp`,
      backup: `${prefix}.bak`,
    });
    if (after !== null) await fs.writeFile(`${prefix}.tmp`, after);
  }
  const path = join(f.location.root, `apply-${id}.json`);
  const journal: WorkspaceJournal = { state, changes };
  const save = () => fs.writeFile(path, JSON.stringify(journal));
  await save();
  const publish = async (index: number, cut?: "moved" | "linked") => {
    const c = changes[index]!;
    if (c.beforeHash !== null) await fs.rename(c.destination, c.backup);
    if (cut === "moved") return;
    if (c.afterHash !== null) {
      await fs.link(c.staging, c.destination);
      if (cut !== "linked") await fs.unlink(c.staging);
    }
  };
  return {
    path,
    journal,
    save,
    publish,
    changes,
    state: async () => JSON.parse(await fs.readFile(path, "utf8")).state,
  };
}

test("dead prepare owner is reclaimed; abandoned prepare data is retained and retry publishes cleanly", async (t) => {
  const f = await fixture(t);
  const location = workspaceLocation(f.data, "next", "step");
  const lock = await ownerRecord(f.data, location.root, await deadPid());
  const partial = `${location.root}.preparing-${randomUUID()}`;
  await fs.mkdir(partial);
  await fs.writeFile(join(partial, "partial.txt"), "diagnostic data");
  const prepared = await f.manager.prepare({
    runId: "next",
    stepId: "step",
    sourcePath: f.source,
    mode: "isolated",
  });
  assert.equal(await fs.readFile(join(prepared, "a.txt"), "utf8"), "before a.txt");
  assert.equal(await read(lock), null);
  assert.equal(await fs.readFile(join(partial, "partial.txt"), "utf8"), "diagnostic data");
});

test("live and permission-unknown owners are never stolen", async (t) => {
  const f = await fixture(t);
  const live = await ownerRecord(f.data, "live", process.pid);
  await assert.rejects(
    withWorkspaceLock(f.data, "live", async () => assert.fail()),
    /is alive/,
  );
  assert.ok(await read(live));
  const pid = await deadPid();
  const unknown = await ownerRecord(f.data, "unknown", pid);
  const kill = process.kill.bind(process);
  const probe = t.mock.method(process, "kill", ((
    target: number,
    signal: NodeJS.Signals | number,
  ) => {
    if (target === pid) throw Object.assign(new Error("permission denied"), { code: "EPERM" });
    return kill(target, signal);
  }) as typeof process.kill);
  await assert.rejects(
    withWorkspaceLock(f.data, "unknown", async () => assert.fail()),
    /is unknown/,
  );
  probe.mock.restore();
  assert.ok(await read(unknown));
});

test("legacy ownerless lock and malformed claims are preserved instead of guessed stale", async (t) => {
  const f = await fixture(t);
  const legacy = join(f.data, "workspace-locks", digest("legacy"));
  await fs.mkdir(legacy);
  await assert.rejects(
    withWorkspaceLock(f.data, "legacy", async () => assert.fail()),
    /no verifiable process owner/,
  );
  assert.ok((await fs.stat(legacy)).isDirectory());
  const malformed = await ownerRecord(f.data, "corrupt", await deadPid());
  await fs.writeFile(malformed, JSON.stringify({ version: 1, pid: 0, token: "bad" }));
  await assert.rejects(
    withWorkspaceLock(f.data, "corrupt", async () => assert.fail()),
    /cannot be verified/,
  );
  assert.ok(await read(malformed));
});

test("a concurrent manager cannot enter a live claim; release removes only its unique owner", async (t) => {
  const f = await fixture(t);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withWorkspaceLock(f.data, "concurrent", async () => {
    entered();
    await hold;
  });
  await started;
  await assert.rejects(
    withWorkspaceLock(f.data, "concurrent", async () => assert.fail()),
    /is alive/,
  );
  release();
  await first;
  assert.equal(await withWorkspaceLock(f.data, "concurrent", async () => "ok"), "ok");
});

test("changes reclaims a dead source owner and rolls back partially installed and moved files", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  await fault.publish(1, "moved");
  const key = `apply:${process.platform === "win32" ? f.source.toLowerCase() : f.source}`;
  const lock = await ownerRecord(f.data, key, await deadPid());
  assert.equal((await f.manager.changes("run", "step")).length, 2);
  for (const name of ["a.txt", "b.txt"])
    assert.equal(await fs.readFile(join(f.source, name), "utf8"), `before ${name}`);
  assert.equal(await fault.state(), "rolled-back");
  assert.equal(await read(lock), null);
});

test("all exact after-hashes confirm commit even before journal update or unlink of staging hard link", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  await fault.publish(1, "linked");
  await f.manager.changes("run", "step");
  assert.equal(await fault.state(), "complete");
  for (const c of fault.changes) {
    assert.equal(await read(c.backup), null);
    assert.equal(await read(c.staging), null);
  }
  assert.equal(await fs.readFile(join(f.source, "b.txt"), "utf8"), "after b.txt");
  await fs.writeFile(join(f.source, "a.txt"), "later user edit");
  assert.equal((await f.manager.changes("run", "step"))[0]?.conflict, true);
});

test("a partial publish hard link is recognized and safely rolled back", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0, "linked");
  await f.manager.changes("run", "step");
  assert.equal(await fault.state(), "rolled-back");
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "before a.txt");
  assert.equal((await fs.stat(join(f.source, "a.txt"))).nlink, 1);
});

test("rollback resumes both captured-after and already-restored hard-link crash windows", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f, undefined, "rolling-back");
  await fault.publish(0);
  await fault.publish(1);
  for (const c of fault.changes) {
    c.rollback = `${c.staging.slice(0, -4)}.rollback-${randomUUID()}`;
    await fs.rename(c.destination, c.rollback);
  }
  await fs.link(fault.changes[1]!.backup, fault.changes[1]!.destination);
  await fault.save();
  await f.manager.changes("run", "step");
  assert.equal(await fault.state(), "rolled-back");
  for (const name of ["a.txt", "b.txt"])
    assert.equal(await fs.readFile(join(f.source, name), "utf8"), `before ${name}`);
});

test("added and deleted files are recovered without replaying an unfinished batch", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.working, "new.txt"), "new agent file");
  await fs.unlink(join(f.working, "a.txt"));
  const fault = await interrupted(f, ["new.txt", "a.txt", "b.txt"]);
  await fault.publish(0);
  await fault.publish(1);
  await f.manager.changes("run", "step");
  assert.equal(await fault.state(), "rolled-back");
  assert.equal(await read(join(f.source, "new.txt")), null);
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "before a.txt");
});

test("user changes survive recovery and other runs of the same source cannot bypass the journal", async (t) => {
  const f = await fixture(t);
  const other = await f.manager.prepare({
    runId: "other",
    stepId: "step",
    sourcePath: f.source,
    mode: "isolated",
  });
  await fs.writeFile(join(other, "b.txt"), "other agent");
  const fault = await interrupted(f);
  await fault.publish(0);
  await fault.publish(1, "moved");
  await fs.writeFile(join(f.source, "a.txt"), "user after crash");
  await assert.rejects(f.manager.changes("run", "step"), /user edit preserved: a.txt/);
  assert.equal(await fault.state(), "rollback-incomplete");
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "user after crash");
  assert.equal(await fs.readFile(join(f.source, "b.txt"), "utf8"), "before b.txt");
  await assert.rejects(f.manager.changes("other", "step"), /user edit preserved: a.txt/);
  await assert.rejects(f.manager.apply("other", "step", ["b.txt"]), /user edit preserved: a.txt/);
  assert.equal(await fs.readFile(fault.changes[0]!.backup, "utf8"), "before a.txt");
});

test("changed backups and redirected journal paths are preserved and rejected", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  await fs.writeFile(fault.changes[0]!.backup, "changed backup");
  await assert.rejects(f.manager.changes("run", "step"), /Preserved changed recovery file/);
  assert.equal(await fs.readFile(fault.changes[0]!.backup, "utf8"), "changed backup");
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "after a.txt");
  const outside = join(f.root, "outside.txt");
  await fs.writeFile(outside, "outside unchanged");
  fault.changes[0]!.destination = outside;
  await fault.save();
  await assert.rejects(f.manager.changes("run", "step"), /does not match its isolation record/);
  assert.equal(await fs.readFile(outside, "utf8"), "outside unchanged");
});

test("a user deletion after publish stays deleted and requires explicit conflict resolution", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  await fs.unlink(join(f.source, "a.txt"));
  await assert.rejects(f.manager.changes("run", "step"), /deletion preserved: a.txt/);
  assert.equal(await read(join(f.source, "a.txt")), null);
  assert.equal(await fs.readFile(fault.changes[0]!.backup, "utf8"), "before a.txt");
});

test("a user write racing rollback capture is restored and preserved, never deleted", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  const rename = fs.rename;
  const hook = t.mock.method(fs, "rename", async (source: PathLike, destination: PathLike) => {
    if (String(source) === join(f.source, "a.txt") && String(destination).includes(".rollback-"))
      await fs.writeFile(source, "racing user write");
    return rename(source, destination);
  });
  await assert.rejects(f.manager.changes("run", "step"), /original edit preserved/);
  hook.mock.restore();
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "racing user write");
  assert.equal(await fs.readFile(fault.changes[0]!.backup, "utf8"), "before a.txt");
});

test("a new user file during rollback restore is never overwritten", async (t) => {
  const f = await fixture(t);
  const fault = await interrupted(f);
  await fault.publish(0);
  const link = fs.link;
  const hook = t.mock.method(fs, "link", async (source: PathLike, destination: PathLike) => {
    if (
      String(source) === fault.changes[0]!.backup &&
      String(destination) === join(f.source, "a.txt")
    )
      await fs.writeFile(destination, "new user file");
    return link(source, destination);
  });
  await assert.rejects(f.manager.changes("run", "step"), /concurrent edits were preserved/);
  hook.mock.restore();
  assert.equal(await fs.readFile(join(f.source, "a.txt"), "utf8"), "new user file");
  assert.equal(await fs.readFile(fault.changes[0]!.backup, "utf8"), "before a.txt");
});
