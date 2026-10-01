// Explicit opt-in actual built CLI/native SQLite acceptance on newly owned fixtures.
// Not part of the ordinary offline suite; never points at existing user data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
assert.equal(process.platform, "linux", "This built CLI acceptance probe is Linux-only");
const root = fileURLToPath(new URL("../../", import.meta.url));
const ownedRoot = mkdtempSync(join(tmpdir(), "knorvia-cli-storage-acceptance-"));
let activeStore;
let activeDb;
let report;
try {
  const home = join(ownedRoot, "home");
  const project = join(ownedRoot, "project");
  for (const path of [home, project, join(ownedRoot, "data"), join(ownedRoot, "storage")])
    mkdirSync(path, { recursive: true });
  const cli = join(root, "apps/cli/packages/cli/dist/knorvia.cjs");
  const { SqliteSessionStore } = await import(
    join(root, "apps/cli/packages/adapters/dist/storage/session-store/sqlite-session-store.js")
  );
  async function prepare(file, ack, fresh = false) {
    const frames = [];
    let errors = "";
    let beforeAck = false;
    const child = spawn(
      process.execPath,
      [cli, "app-server", "--stdio", "--prepare-storage", "--cwd", project],
      {
        cwd: project,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: home,
          SHELL: "/bin/sh",
          LANG: "C.UTF-8",
          KNORVIA_ENV: "test",
          KNORVIA_RUNTIME_ENV: "production",
          KNORVIA_DATA_BASE_DIR: join(ownedRoot, "data"),
          KNORVIA_STORAGE_DIR: join(ownedRoot, "storage"),
          KNORVIA_SESSION_DB_PATH: file,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let timedOut = false;
    let escalation;
    const stopOwnedChild = () => {
      child.kill("SIGTERM");
      if (escalation) return;
      escalation = setTimeout(() => {
        child.kill("SIGKILL");
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      }, 2000);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stopOwnedChild();
    }, 12000);
    const lines = createInterface({ input: child.stdout });
    let protocolError;
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on("error", (error) => {
        protocolError ??= error;
        stopOwnedChild();
      });
    }
    let stdoutBytes = 0;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 2 * 1024 * 1024) {
        protocolError ??= new Error("Owned CLI stdout exceeded the probe bound");
        stopOwnedChild();
        child.stdout.destroy();
      }
    });
    lines.on("line", (line) => {
      try {
        assert.ok(line.length < 65536);
        const f = JSON.parse(line);
        frames.push(f);
        if (f.method === "startup/storagePath") {
          assert.equal(f.params.path, file);
          if (fresh) assert.equal(existsSync(file), false);
          beforeAck = true;
          child.stdin.write(JSON.stringify(ack) + "\n");
        }
      } catch (e) {
        protocolError ??= e;
        stopOwnedChild();
        child.stdout.destroy();
      }
    });
    child.stderr.on("data", (c) => {
      try {
        errors += c;
        assert.ok(errors.length < 65536);
      } catch (error) {
        protocolError ??= error;
        stopOwnedChild();
        child.stderr.destroy();
      }
    });
    let code;
    try {
      code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
    } finally {
      clearTimeout(timer);
      clearTimeout(escalation);
      lines.close();
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    }
    if (protocolError) throw protocolError;
    assert.equal(timedOut, false, "Owned CLI subprocess exceeded the probe deadline");
    assert.equal(code.signal, null);
    assert.equal(beforeAck, true);
    return { ...code, frames, stderr: errors };
  }
  const dbPath = join(project, "owned-session.sqlite");
  const first = await prepare(dbPath, { method: "startup/storagePathReady", reuse: false }, true);
  assert.equal(first.code, 0);
  assert.equal(first.frames.at(-1).method, "startup/storagePrepared");
  assert.ok(first.frames.some((f) => f.params?.phase === "ready"));
  const store = new SqliteSessionStore({ dbPath });
  activeStore = store;
  const sessionID = "owned-built-cli-session";
  await store.createSession({
    id: sessionID,
    projectID: "owned-built-cli-project",
    slug: "owned",
    directory: project,
    title: "Owned synthetic session",
    version: "1",
    time: { created: 10, updated: 11 },
  });
  await store.updateTodos({
    sessionID,
    todos: [{ content: "Synthetic task", status: "in_progress", priority: "high" }],
  });
  await store.saveSessionEntry({
    id: "owned-entry",
    sessionID,
    type: "fixture/entry",
    time: { created: 12, updated: 13 },
    data: { note: "Fictional data", unicode: "合成数据" },
  });
  store.close();
  activeStore = undefined;
  let db = new DatabaseSync(dbPath);
  activeDb = db;
  db.prepare(
    "INSERT INTO message(id,session_id,time_created,time_updated,data,sequence) VALUES(?,?,?,?,?,?)",
  ).run(
    "owned-message",
    sessionID,
    14,
    15,
    JSON.stringify({ id: "owned-message", role: "user", unknown: "retained synthetic field" }),
    0,
  );
  db.prepare(
    "INSERT INTO part(id,session_id,message_id,time_created,time_updated,data,sequence) VALUES(?,?,?,?,?,?,?)",
  ).run(
    "owned-part",
    sessionID,
    "owned-message",
    14,
    15,
    JSON.stringify({ id: "owned-part", type: "text", text: "Synthetic content 中文" }),
    0,
  );
  function snapshot(db) {
    return Object.fromEntries(
      ["session", "session_entry", "todo", "message", "part"].map((t) => [
        t,
        db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(),
      ]),
    );
  }
  const before = snapshot(db);
  db.close();
  activeDb = undefined;
  const repeated = await prepare(dbPath, { method: "startup/storagePathReady", reuse: false });
  assert.equal(repeated.code, 0);
  db = new DatabaseSync(dbPath);
  activeDb = db;
  assert.deepEqual(snapshot(db), before);
  db.exec("BEGIN EXCLUSIVE; ROLLBACK;");
  db.close();
  activeDb = undefined;
  const bytes = readFileSync(dbPath);
  const reused = await prepare(dbPath, { method: "startup/storagePathReady", reuse: true });
  assert.equal(reused.code, 0);
  assert.deepEqual(readFileSync(dbPath), bytes);
  assert.deepEqual(
    reused.frames.map((f) => f.method),
    ["startup/storagePath", "startup/storagePrepared"],
  );
  const invalidPath = join(project, "invalid-ack.sqlite");
  const invalid = await prepare(invalidPath, { method: "wrong" }, true);
  assert.equal(invalid.code, 1);
  assert.equal(existsSync(invalidPath), false);
  assert.equal(
    invalid.frames.some((f) => f.method === "startup/storagePrepared"),
    false,
  );
  assert.equal(invalid.frames.at(-1).params.phase, "failed");
  report = {
    fresh: {
      exit: first.code,
      observedBeforeWrite: true,
      phases: first.frames.map((f) => f.params?.phase).filter(Boolean),
    },
    repeated: {
      exit: repeated.code,
      preservedTables: Object.keys(before),
      rowCounts: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.length])),
      exclusiveAfterClose: true,
    },
    reuse: { exit: reused.code, databaseBytesUnchanged: true },
    invalidAck: { exit: invalid.code, noDatabase: true, noPrepared: true },
    nativeSqlite: true,
    scope:
      "owned synthetic current-schema fixture through actual built CLI, not all legacy/user-data migration acceptance",
  };
} finally {
  for (const close of [
    () => activeStore?.close(),
    () => activeDb?.close(),
    () => rmSync(ownedRoot, { recursive: true, force: true }),
  ]) {
    try {
      close();
    } catch {
      process.exitCode = 1;
      console.error("Owned acceptance fixture cleanup failed");
    }
  }
}
console.log(JSON.stringify({ ...report, ownedFixtureCleanupCompleted: process.exitCode !== 1 }));
