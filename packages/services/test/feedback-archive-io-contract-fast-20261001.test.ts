// Frozen synthetic filesystem/stream contracts. No native log collection or output writes.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { mock, test, type TestContext } from "node:test";

const directory = resolve("synthetic-feedback/owned-source");
const outputRootDir = resolve("synthetic-feedback/owned-output");
const outputDirectory = join(outputRootDir, "archive-synthetic");
const now = new Date(2026, 8, 30, 12);
const filename = join(directory, "a.log");
const dirent = (name: string, kind = "file") => ({
  name,
  isFile: () => kind === "file",
  isDirectory: () => kind === "directory",
  isSymbolicLink: () => kind === "link",
});
const info = (overrides: object = {}) => ({
  isFile: () => true,
  isDirectory: () => false,
  nlink: 1,
  ino: 3,
  dev: 7,
  size: 15,
  mtimeMs: now.getTime(),
  ...overrides,
});
let config: ReturnType<typeof setup>;
function setup() {
  return {
    bytes: Buffer.from("safe diagnostic"),
    before: info(),
    opened: info(),
    rootIsDirectory: true,
    rootRealpath: directory as string | null,
    fileRealpath: filename as string | null,
    rootEntries: [dirent("a.log")],
    directories: new Map<string, ReturnType<typeof dirent>[]>(),
    listed: [] as string[],
    snapshots: [] as Array<{ name: string; data: Buffer }>,
    reads: [] as Array<{ offset: number; length: number; position: number }>,
    openedPaths: [] as Array<{ path: string; flags: number }>,
    removed: [] as Array<{ path: string; options: object }>,
    closed: 0,
    mkdirCalls: 0,
    tempCalls: 0,
    streamMode: 0,
    partialLimit: Infinity,
    mkdirError: undefined as unknown,
    tempError: undefined as unknown,
    openError: undefined as unknown,
    statError: undefined as unknown,
    readError: undefined as unknown,
    closeError: undefined as unknown,
    cleanupError: undefined as unknown,
    outputError: undefined as Error | undefined,
    zipError: undefined as Error | undefined,
    finalStatError: undefined as unknown,
    addError: undefined as unknown,
    zipOutput: undefined as PassThrough | undefined,
    outputStream: undefined as Writable | undefined,
    settledAtCleanup: false,
  };
}
mock.module("node:fs/promises", {
  namedExports: {
    realpath: async (path: string) => {
      const value = path === directory ? config.rootRealpath : config.fileRealpath;
      if (value === null) throw new Error("synthetic missing realpath");
      return value;
    },
    lstat: async (path: string) =>
      path === directory ? { isDirectory: () => config.rootIsDirectory } : config.before,
    readdir: async (path: string) => {
      config.listed.push(path);
      return path === directory ? config.rootEntries : (config.directories.get(path) ?? []);
    },
    mkdir: async () => {
      config.mkdirCalls++;
      if (config.mkdirError !== undefined) throw config.mkdirError;
    },
    mkdtemp: async () => {
      config.tempCalls++;
      if (config.tempError !== undefined) throw config.tempError;
      return outputDirectory;
    },
    open: async (path: string, flags: number) => {
      config.openedPaths.push({ path, flags });
      if (config.openError !== undefined) throw config.openError;
      return {
        stat: async () => {
          if (config.statError !== undefined) throw config.statError;
          return config.opened;
        },
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          config.reads.push({ offset, length, position });
          if (config.readError !== undefined) throw config.readError;
          const count = Math.max(
            0,
            Math.min(length, config.partialLimit, config.bytes.length - position),
          );
          config.bytes.copy(buffer, offset, position, position + count);
          return { bytesRead: count };
        },
        close: async () => {
          config.closed++;
          if (config.closeError !== undefined) throw config.closeError;
        },
      };
    },
    rm: async (path: string, options: object) => {
      config.settledAtCleanup = Boolean(
        config.zipOutput?.destroyed && config.outputStream?.destroyed,
      );
      config.removed.push({ path, options });
      if (config.cleanupError !== undefined) throw config.cleanupError;
    },
    stat: async () => {
      if (config.finalStatError !== undefined) throw config.finalStatError;
      return { size: 777 };
    },
  },
});
mock.module("node:fs", {
  namedExports: {
    constants,
    createWriteStream: (_path: string, options: { mode: number }) => {
      config.streamMode = options.mode;
      config.outputStream = new Writable({
        write(_chunk, _encoding, done) {
          done(config.outputError);
        },
      });
      return config.outputStream;
    },
  },
});
mock.module("yazl", {
  namedExports: {
    ZipFile: class {
      outputStream = new PassThrough();
      constructor() {
        config.zipOutput = this.outputStream;
      }
      addBuffer(data: Buffer, name: string) {
        if (config.addError !== undefined) throw config.addError;
        config.snapshots.push({ name, data });
      }
      end() {
        if (config.zipError) this.outputStream.destroy(config.zipError);
        else this.outputStream.end("synthetic ZIP output");
      }
    },
  },
});
const emitted = process.env.KNORVIA_FEEDBACK_ARCHIVE_TARGET === "dist";
const {
  createFeedbackDiagnosticArchive: archive,
}: typeof import("../src/feedback/feedbackLogArchive.js") = await import(
  new URL(
    `../${emitted ? "dist" : "src"}/feedback/feedbackLogArchive.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href
);

function fixture(t: TestContext) {
  config = setup();
  t.after(() => assert.ok(config.closed <= config.openedPaths.length));
  return () =>
    archive({ sources: [{ directory, archivePrefix: "logs" }], outputRootDir, now: () => now });
}
function skips() {
  const about = config.snapshots.at(-1)!.data.toString();
  return JSON.parse(
    about
      .split("\n")
      .find((line) => line.startsWith("skippedLogFilesByReason: "))!
      .slice(24),
  );
}

test("snapshot reads are positional, continue partial reads and exclude appended bytes", async (t) => {
  const run = fixture(t);
  config.bytes = Buffer.from("safe diagnostic plus appended bytes");
  config.partialLimit = 4;
  assert.deepEqual(await run(), {
    path: join(outputDirectory, "knorvia-diagnostic-logs.zip"),
    size: 777,
  });
  assert.equal(config.streamMode, 0o600);
  assert.deepEqual(config.openedPaths, [
    { path: filename, flags: constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) },
  ]);
  assert.deepEqual(config.reads, [
    { offset: 0, length: 15, position: 0 },
    { offset: 4, length: 11, position: 4 },
    { offset: 8, length: 7, position: 8 },
    { offset: 12, length: 3, position: 12 },
  ]);
  assert.equal(config.snapshots[0]!.data.toString(), "safe diagnostic");
  assert.equal(config.closed, 1);
});

test("symlink roots, failed root realpath and child links are ignored without opening", async (t) => {
  const run = fixture(t);
  config.rootIsDirectory = false;
  await run();
  assert.deepEqual(config.listed, []);
  assert.deepEqual(config.openedPaths, []);
  config = setup();
  config.rootRealpath = null;
  await run();
  assert.deepEqual(config.listed, []);
  config = setup();
  config.rootEntries = [dirent("a.log", "link")];
  await run();
  assert.deepEqual(config.openedPaths, []);
  assert.deepEqual(skips(), {});
});

test("unsafe canonical paths and failed opens retain distinct skip reasons", async (t) => {
  const run = fixture(t);
  config.fileRealpath = join(directory, "elsewhere.log");
  await run();
  assert.deepEqual(skips(), { "unsafe-path": 1 });
  assert.deepEqual(config.openedPaths, []);
  config = setup();
  config.openError = new Error("synthetic open failure");
  await run();
  assert.deepEqual(skips(), { "open-failed": 1 });
  assert.equal(config.closed, 0);
});

test("each pre-open metadata rejection prevents file opening", async (t) => {
  const run = fixture(t);
  for (const override of [
    { isFile: () => false },
    { nlink: 2 },
    { size: 8 * 1024 * 1024 + 1 },
    { mtimeMs: new Date(2026, 8, 29).getTime() },
  ]) {
    config = setup();
    config.before = info(override);
    await run();
    assert.deepEqual(skips(), { "metadata-policy": 1 });
    assert.deepEqual(config.openedPaths, []);
  }
});

test("opened inode, device, link, date, kind and size races reject while closing once", async (t) => {
  const run = fixture(t);
  for (const override of [
    { ino: 4 },
    { dev: 8 },
    { nlink: 2 },
    { isFile: () => false },
    { size: 8 * 1024 * 1024 + 1 },
    { mtimeMs: new Date(2026, 9, 1).getTime() },
  ]) {
    config = setup();
    config.opened = info(override);
    await run();
    assert.deepEqual(skips(), { "opened-file-policy": 1 });
    assert.deepEqual(config.reads, []);
    assert.equal(config.closed, 1);
  }
});

test("short reads skip without passing raw contents into ZIP", async (t) => {
  const run = fixture(t);
  config.bytes = Buffer.from("private");
  await run();
  assert.deepEqual(skips(), { "short-read": 1 });
  assert.deepEqual(
    config.snapshots.map((entry) => entry.name),
    ["about.txt"],
  );
  assert.equal(config.closed, 1);
});

test("opened empty files are valid and require no read call", async (t) => {
  const run = fixture(t);
  config.before = info({ size: 0 });
  config.opened = info({ size: 0 });
  await run();
  assert.deepEqual(config.reads, []);
  assert.equal(config.snapshots[0]!.data.length, 0);
  assert.equal(config.closed, 1);
});

test("read/stat failures clean operation output, retaining original error identity", async (t) => {
  const run = fixture(t);
  for (const key of ["statError", "readError"] as const) {
    config = setup();
    const failure = new Error(`synthetic ${key}`);
    config[key] = failure;
    await assert.rejects(run(), (error) => error === failure);
    assert.equal(config.closed, 1);
    assert.deepEqual(config.removed, [
      { path: outputDirectory, options: { recursive: true, force: true } },
    ]);
  }
});

test("close failures keep precedence over read errors; cleanup failure keeps its precedence", async (t) => {
  const run = fixture(t);
  config.readError = new Error("synthetic read failure");
  const close = new Error("synthetic close failure");
  config.closeError = close;
  await assert.rejects(run(), (error) => error === close);
  const cleanup = new Error("synthetic cleanup failure");
  config = setup();
  config.closeError = close;
  config.cleanupError = cleanup;
  await assert.rejects(run(), (error) => error === cleanup);
});

test("ZIP, output stream and final stat failures reject and clean the operation directory", async (t) => {
  const run = fixture(t);
  for (const key of ["zipError", "outputError", "finalStatError"] as const) {
    config = setup();
    const failure = new Error(`synthetic ${key}`);
    config[key] = failure;
    await assert.rejects(run(), (error) => error === failure);
    assert.equal(config.removed.length, 1);
    assert.equal(config.removed[0]!.path, outputDirectory);
  }
});

test("root creation failures occur before guarded cleanup and remain unwrapped", async (t) => {
  const run = fixture(t);
  for (const key of ["mkdirError", "tempError"] as const) {
    config = setup();
    const failure = new Error(`synthetic ${key}`);
    config[key] = failure;
    await assert.rejects(run(), (error) => error === failure);
    assert.deepEqual(config.removed, []);
    assert.deepEqual(config.openedPaths, []);
  }
});

test("global 2000-entry cap counts ignored entries and fences later source traversal", async (t) => {
  const run = fixture(t);
  config.rootEntries = Array.from({ length: 2000 }, (_, index) =>
    dirent(`ignored-${String(index).padStart(4, "0")}.txt`),
  );
  config.rootEntries.push(dirent("z.log"));
  await run();
  assert.deepEqual(config.openedPaths, []);
  config = setup();
  config.rootEntries = Array.from({ length: 1999 }, (_, index) =>
    dirent(`ignored-${String(index).padStart(4, "0")}.txt`),
  );
  config.rootEntries.push(dirent("z.log"));
  config.fileRealpath = join(directory, "z.log");
  await run();
  assert.equal(config.openedPaths.length, 1);
  config.listed = [];
  config.openedPaths = [];
  config.closed = 0;
  config.snapshots = [];
  await archive({
    sources: [
      { directory, archivePrefix: "first" },
      { directory, archivePrefix: "second" },
    ],
    outputRootDir,
    now: () => now,
  });
  assert.deepEqual(config.listed, [directory]);
  assert.equal(config.openedPaths.length, 1);
  assert.deepEqual(
    config.snapshots.map((entry) => entry.name),
    ["first/z.log", "about.txt"],
  );
});

test("traversal descends through depth four but never lists depth five", async (t) => {
  const run = fixture(t);
  config.rootEntries = [dirent("d1", "directory")];
  let parent = directory;
  for (let depth = 1; depth <= 5; depth++) {
    parent = join(parent, `d${depth}`);
    config.directories.set(parent, [dirent(`d${depth + 1}`, "directory")]);
  }
  await run();
  assert.deepEqual(
    config.listed.map((path) => path.slice(directory.length)),
    [
      "",
      join("", "d1"),
      join("", "d1", "d2"),
      join("", "d1", "d2", "d3"),
      join("", "d1", "d2", "d3", "d4"),
    ].map((path) => (path ? `${process.platform === "win32" ? "\\" : "/"}${path}` : "")),
  );
});

test("ZIP construction rejection settles both streams before output cleanup", async (t) => {
  const run = fixture(t);
  const state = config;
  t.after(() => {
    state.zipOutput?.end();
    state.outputStream?.end();
  });
  const failure = new Error("synthetic ZIP entry rejection");
  config.addError = failure;
  await assert.rejects(run(), (error) => error === failure);
  assert.equal(config.settledAtCleanup, true);
  assert.equal(config.zipOutput!.destroyed, true);
  assert.equal(config.outputStream!.destroyed, true);
  assert.equal(config.removed.length, 1);
});
