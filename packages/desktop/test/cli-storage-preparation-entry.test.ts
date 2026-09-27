import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { isStoragePreparationInvocation } from "../../../apps/cli/packages/cli/src/arguments.js";
import { prepareProtocolCommandEnv } from "../../../apps/cli/packages/cli/src/env.js";
import { runStoragePreparationCommand } from "../../../apps/cli/packages/cli/src/storage-preparation-command.js";
import { prepareKnorviaStorage } from "../../../apps/cli/packages/bootstrap/src/storage-startup-entrypoint.js";
import { openProtocolStartupStorage } from "../../../apps/cli/packages/bootstrap/src/protocol/storage-startup.js";

test("only standard Host storage invocations bypass the general command router", () => {
  for (const command of ["app-server", "agent-server"]) {
    assert.equal(isStoragePreparationInvocation([command, "--stdio", "--prepare-storage"]), true);
    assert.equal(
      isStoragePreparationInvocation([
        "--cwd",
        "project with spaces",
        command,
        "--prepare-storage",
        "--stdio",
      ]),
      true,
    );
    for (const extra of [
      ["--help"],
      ["--version"],
      ["--prompt", "task"],
      ["--surface", "invalid"],
      ["--unknown"],
      ["extra"],
    ])
      assert.equal(
        isStoragePreparationInvocation([command, "--stdio", "--prepare-storage", ...extra]),
        false,
      );
  }
  assert.equal(isStoragePreparationInvocation(["tui", "--stdio", "--prepare-storage"]), false);
  assert.equal(isStoragePreparationInvocation(["app-server", "--prepare-storage"]), false);
  assert.equal(
    isStoragePreparationInvocation(["app-server", "--stdio", "--cwd", "--prepare-storage"]),
    false,
  );
});

test("protocol environment is shared: production skips dotenv; development sanitizes after load", () => {
  let reads = 0;
  const loader = ({ env }: { env?: Record<string, string | undefined> }) => {
    reads++;
    env!.NODE_ENV = "test";
    env!.KNORVIA_SESSION_DB_PATH = "from-env.db";
    return { keys: ["NODE_ENV", "KNORVIA_SESSION_DB_PATH"], loaded: true };
  };
  const production = prepareProtocolCommandEnv({
    cwd: process.cwd(),
    env: { KNORVIA_RUNTIME_ENV: "production" },
    loadDotenv: loader,
  });
  assert.equal(reads, 0);
  assert.equal(production.KNORVIA_SESSION_DB_PATH, undefined);
  const development = prepareProtocolCommandEnv({
    cwd: process.cwd(),
    env: { KNORVIA_RUNTIME_ENV: "development" },
    loadDotenv: loader,
  });
  assert.equal(reads, 1);
  assert.equal(development.NODE_ENV, undefined);
  assert.equal(development.KNORVIA_SESSION_DB_PATH, "from-env.db");
  assert.throws(
    () =>
      prepareProtocolCommandEnv({
        cwd: process.cwd(),
        env: { KNORVIA_RUNTIME_ENV: "development" },
        loadDotenv: () => ({
          keys: [],
          loaded: false,
          error: new Error("fixture"),
          path: "fixture.env",
        }),
      }),
    /Failed to load environment/,
  );
});

test("narrow command preserves cwd and streams, and reports prepare or cwd failure as nonzero", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-storage-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "project with spaces");
  await mkdir(project);
  const input = new PassThrough();
  const output = new PassThrough();
  const stderr = new PassThrough();
  let errors = "";
  stderr.on("data", (chunk) => {
    errors += chunk;
  });
  const context = {
    argv: ["app-server", "--stdio", "--prepare-storage", "--cwd", "project with spaces"],
    stdin: input as unknown as NodeJS.ReadStream,
    stdout: output as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
  };
  let prepared = 0;
  assert.equal(
    await runStoragePreparationCommand(context, {
      cwd: () => root,
      env: { KNORVIA_RUNTIME_ENV: "production", KNORVIA_SESSION_DB_PATH: "session.db" },
      prepare: async (options) => {
        prepared++;
        assert.equal(options.cwd, project);
        assert.equal(options.env?.KNORVIA_SESSION_DB_PATH, "session.db");
        assert.equal(options.input, input);
        assert.equal(options.output, output);
      },
    }),
    0,
  );
  assert.equal(prepared, 1);
  assert.equal(errors, "");
  assert.equal(
    await runStoragePreparationCommand(context, {
      cwd: () => root,
      env: { KNORVIA_RUNTIME_ENV: "production" },
      prepare: async () => {
        throw new Error("migration failed");
      },
    }),
    1,
  );
  assert.match(errors, /migration failed/);
  assert.equal(
    await runStoragePreparationCommand(
      { ...context, argv: ["app-server", "--stdio", "--prepare-storage", "--cwd", "missing"] },
      {
        cwd: () => root,
        prepare: async () => {
          prepared++;
        },
      },
    ),
    1,
  );
  assert.equal(prepared, 1);
});

test("public storage entry waits for observation ACK, creates the cwd database, then closes before prepared", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-storage-entry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dbPath = join(root, "session.db");
  const input = new PassThrough();
  const frames: any[] = [];
  let sawPath!: () => void;
  const pathAnnounced = new Promise<void>((resolvePath) => {
    sawPath = resolvePath;
  });
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const frame = JSON.parse(String(chunk));
      frames.push(frame);
      if (frame.method === "startup/storagePath") sawPath();
      callback();
    },
  });
  const preparing = prepareKnorviaStorage({
    cwd: root,
    env: { KNORVIA_ENV: "test", KNORVIA_SESSION_DB_PATH: "session.db" },
    input,
    output,
  });
  t.after(() => input.destroy());
  await pathAnnounced;
  assert.equal(frames[0].params.path, dbPath);
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(existsSync(dbPath), false);
  assert.equal(frames.length, 1);
  input.write('{"method":"startup/storagePathReady","reuse":false}\n');
  await preparing;
  assert.equal(frames.at(-1).method, "startup/storagePrepared");
  assert.ok(frames.some((frame) => frame.params.phase === "ready"));
  const db = new DatabaseSync(dbPath);
  db.exec("BEGIN EXCLUSIVE; ROLLBACK;");
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length > 0);
  db.close();
});

test("failed ACK never writes the database or emits storagePrepared", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-storage-entry-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = new PassThrough();
  const frames: any[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const frame = JSON.parse(String(chunk));
      frames.push(frame);
      if (frame.method === "startup/storagePath") input.write('{"method":"wrong"}\n');
      callback();
    },
  });
  await assert.rejects(
    prepareKnorviaStorage({
      cwd: root,
      env: { KNORVIA_ENV: "test", KNORVIA_SESSION_DB_PATH: "session.db" },
      input,
      output,
    }),
  );
  input.destroy();
  assert.equal(existsSync(join(root, "session.db")), false);
  assert.equal(
    frames.some((frame) => frame.method === "startup/storagePrepared"),
    false,
  );
  assert.equal(frames.at(-1).params.phase, "failed");
});

test("storage close failure rejects preparation without a prepared frame and keeps the primary error", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-storage-entry-close-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // 通过准备入口实际使用的存储类取得 prototype；不另造一个与其依赖实例不相同的 mock。
  const seed = await openProtocolStartupStorage({
    dbPath: join(root, "prototype.db"),
    output: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  });
  const prototype = Object.getPrototypeOf(seed) as typeof seed;
  const close = prototype.close;
  seed.close();
  const primary = new Error("fixture: first storage close failed");
  const cleanup = new Error("fixture: cleanup close also failed");
  let attempts = 0;
  t.mock.method(prototype, "close", function (this: typeof seed) {
    attempts++;
    if (attempts === 1) throw primary;
    // 第一次故障仍持有真实连接；清理时释放它，再模拟次生错误，验证最初异常不被覆盖。
    close.call(this);
    throw cleanup;
  });
  const input = new PassThrough();
  t.after(() => input.destroy());
  const frames: any[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const frame = JSON.parse(String(chunk));
      frames.push(frame);
      if (frame.method === "startup/storagePath")
        input.write('{"method":"startup/storagePathReady","reuse":false}\n');
      callback();
    },
  });
  await assert.rejects(
    prepareKnorviaStorage({
      cwd: root,
      env: { KNORVIA_ENV: "test", KNORVIA_SESSION_DB_PATH: "session.db" },
      input,
      output,
    }),
    (error) => error === primary,
  );
  assert.equal(attempts, 2, "the real session store must attempt closing and cleanup");
  assert.ok(
    frames.some((frame) => frame.params.phase === "ready"),
    "migration reached ready before the injected close failure",
  );
  assert.equal(
    frames.some((frame) => frame.method === "startup/storagePrepared"),
    false,
  );
  assert.equal(frames.at(-1).params.phase, "failed");
});

test("Host-granted reuse does not open or modify a previously prepared database", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-storage-entry-reuse-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = resolve(root, "session.db");
  await writeFile(path, "already prepared sentinel");
  const input = new PassThrough();
  const frames: any[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const frame = JSON.parse(String(chunk));
      frames.push(frame);
      if (frame.method === "startup/storagePath")
        input.write('{"method":"startup/storagePathReady","reuse":true}\n');
      callback();
    },
  });
  await prepareKnorviaStorage({
    cwd: root,
    env: { KNORVIA_ENV: "test", KNORVIA_SESSION_DB_PATH: path },
    input,
    output,
  });
  input.destroy();
  assert.deepEqual(
    frames.map((frame) => frame.method),
    ["startup/storagePath", "startup/storagePrepared"],
  );
  assert.equal(await readFile(path, "utf8"), "already prepared sentinel");
});
