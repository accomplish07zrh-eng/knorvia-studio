import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { dirname, join, sep } from "node:path";
import { PassThrough, Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import { loadNativeOwner } from "./native-owner-fixture.mjs";

// Authored and unrun. Actual in-memory stream primitives consume supplied fs,
// about/logger/services/ZIP/Electron ports. No real filesystem/native stream,
// application, process, credential or user-data operation is reachable.
function ports() {
  const now = new Date(2024, 0, 2, 3, 4, 5);
  const state = {
    now,
    appRoot: join("fixture-data", "v2"),
    nodes: new Map(),
    trace: [],
    warnings: [],
    archives: [],
    feedbackCalls: [],
    ids: 0,
  };
  const absent = () => Object.assign(new Error("fixture missing"), { code: "ENOENT" });
  const resolve = (path) => {
    const node = state.nodes.get(path);
    if (!node) throw absent();
    return node.kind === "link" ? resolve(node.target) : node;
  };
  state.dir = (path) => {
    if (path === "." || state.nodes.has(path)) return;
    state.dir(dirname(path));
    state.nodes.set(path, { kind: "dir" });
  };
  state.file = (path, data, mtime = now.getTime()) => {
    state.dir(dirname(path));
    state.nodes.set(path, { kind: "file", data: Buffer.from(data), mtime });
  };
  state.mkdir = async (path) => {
    state.trace.push(["mkdir", path]);
    state.dir(path);
  };
  state.mkdtemp = async (prefix) => {
    const path = `${prefix}fixture${++state.ids}`;
    state.dir(path);
    state.trace.push(["temp", path]);
    return path;
  };
  state.stat = async (path) => {
    const node = resolve(path);
    return {
      isDirectory: () => node.kind === "dir",
      isFile: () => node.kind === "file",
      mtimeMs: node.mtime,
    };
  };
  state.realpath = async (path) => {
    const node = state.nodes.get(path);
    if (!node) throw absent();
    return node.kind === "link" ? node.target : path;
  };
  state.readdir = async (path) => {
    state.trace.push(["readDir", path]);
    if (resolve(path).kind !== "dir") throw absent();
    return [...state.nodes]
      .filter(([key]) => dirname(key) === path)
      .map(([key, node]) => ({
        name: key.slice(path.length + 1),
        isDirectory: () => node.kind === "dir",
        isFile: () => node.kind === "file",
        isSymbolicLink: () => node.kind === "link",
      }));
  };
  state.access = async (path) => {
    resolve(path);
  };
  state.open = async (path) => ({
    async read(buffer, offset, count, position) {
      const data = resolve(path).data;
      const bytesRead = Math.min(count, data.length - position);
      data.copy(buffer, offset, position, position + bytesRead);
      return { bytesRead };
    },
    async close() {
      state.trace.push(["close", path]);
    },
  });
  state.readStream = (path, { start }) => {
    const data = resolve(path).data.subarray(start);
    const chunks = [];
    for (let offset = 0; offset < data.length; offset += 7)
      chunks.push(data.subarray(offset, offset + 7));
    return Readable.from(chunks);
  };
  state.writeStream = (path) => {
    const chunks = [];
    return new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final(callback) {
        state.file(path, Buffer.concat(chunks));
        callback();
      },
    });
  };
  state.writeFile = async (path, text) => {
    state.file(path, Buffer.from(text));
  };
  state.rm = async (path, options) => {
    state.trace.push(["remove", path, options]);
    for (const key of state.nodes.keys())
      if (key === path || (options.recursive && key.startsWith(path + sep)))
        state.nodes.delete(key);
  };
  state.logger = {
    info() {},
    error() {},
    warn(...args) {
      state.warnings.push(args);
    },
  };
  state.Zip = class extends EventEmitter {
    constructor() {
      super();
      this.outputStream = new PassThrough();
      this.files = new Map();
      state.archives.push(this);
    }
    addFile(path, name) {
      this.files.set(name, Buffer.from(resolve(path).data));
    }
    end() {
      this.outputStream.end("fixture ZIP");
    }
  };
  state.feedback = async (options) => {
    state.feedbackCalls.push(options);
    return { path: "fixture-feedback.zip", size: 17 };
  };
  state.Transform = Transform;
  state.pipeline = pipeline;
  return state;
}
const modules = {
  "node:fs":
    "export const constants={R_OK:4}; export const createReadStream=port.readStream; export const createWriteStream=port.writeStream;",
  "node:fs/promises":
    "export const access=port.access,mkdir=port.mkdir,mkdtemp=port.mkdtemp,open=port.open,readdir=port.readdir,realpath=port.realpath,rm=port.rm,stat=port.stat,writeFile=port.writeFile;",
  "node:stream": "export const Transform=port.Transform;",
  "node:stream/promises": "export const pipeline=port.pipeline;",
  yazl: "export const ZipFile=port.Zip;",
  "@knorvia/services/node":
    "export const getAppConfigDir=()=> port.appRoot,getExportLogDir=()=> 'fixture-output',getExportLogStageDir=()=> 'fixture-stage',getFeedbackLogArchiveDir=()=> 'fixture-feedback'; export const createFeedbackDiagnosticArchive=port.feedback;",
  "./about.js":
    "export const readBuildMetadata=()=>({}),createAboutSnapshot=(value)=>value,formatAboutDetail=()=> 'fixture about';",
  "./logger.js": "export const logger=port.logger;",
  electron: "export const shell={showItemInFolder(){throw new Error('unsupplied reveal');}};",
};

test("complete default exporter selects diagnostic roots, sanitizes chunked encodings, stages ZIP and retires the stage", async () => {
  const state = ports();
  const root = state.appRoot;
  state.file(
    join(root, "logs", "today.log"),
    "ready\napiKey=fixture-secret\n-----BEGIN OPENSSH PRIVATE KEY-----\nfixture-key-body\n-----END OPENSSH PRIVATE KEY-----\nlast\n",
  );
  const wide = Buffer.from("可用\nAPI_KEY=fixture-wide-secret\n结束", "utf16le").swap16();
  state.file(join(root, "logs", "unicode.txt"), Buffer.concat([Buffer.from([0xfe, 0xff]), wide]));
  state.file(join(root, "logs", "memory.log"), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  state.file(join(root, "logs", "old.log"), "old", 0);
  state.file(join(root, "logs", "debug", "private.log"), "private-debug");
  state.file(join(root, "creation", "private.txt"), "private-state");
  state.nodes.set(join(root, "logs", "loop"), { kind: "link", target: root });
  state.file(join("fixture-data", "cli", "log", "cli.log"), "cli\n");
  state.file(join("fixture-data", "computer-use", "run", "helper.exit.log"), "helper\n", 0);
  state.file(join("fixture-data", "computer-use", "run", "helper.tokens"), "private-broker");
  const { exportLogs } = await loadNativeOwner("exportLogs", state, modules);
  const revealed = [];
  const result = await exportLogs({
    now: () => state.now,
    showItemInFolder: (path) => revealed.push(path),
  });
  assert.equal(result.success, true);
  assert.equal(result.path, revealed[0]);
  assert.ok(result.path.endsWith(".zip"));
  const archived = state.archives[0].files;
  assert.deepEqual(
    [...archived.keys()].sort(),
    [
      ".knorvia-studio/cli/log/cli.log",
      ".knorvia-studio/computer-use/run/helper.exit.log",
      "about.txt",
      "logs/today.log",
      "logs/unicode.txt",
    ].sort(),
  );
  assert.equal(
    archived.get("logs/today.log").toString(),
    "ready\napiKey=***REDACTED***\n***REDACTED***\nlast\n",
  );
  const encoded = archived.get("logs/unicode.txt");
  assert.deepEqual([...encoded.subarray(0, 2)], [0xfe, 0xff]);
  assert.equal(
    Buffer.from(encoded.subarray(2)).swap16().toString("utf16le"),
    "可用\nAPI_KEY=***REDACTED***\n结束",
  );
  assert.equal(archived.get("about.txt").toString(), "fixture about");
  assert.equal(
    state.trace.some(([event, path]) => event === "readDir" && path.includes("creation")),
    false,
  );
  assert.ok(
    state.trace.some(
      ([event, path, options]) =>
        event === "remove" &&
        path.startsWith(join("fixture-stage", "stage-")) &&
        options.recursive &&
        options.force,
    ),
  );
  assert.ok(
    state.warnings.some(([, value]) =>
      value.skippedFiles?.some((file) => file.error === "unsupported binary diagnostic"),
    ),
  );
});

test("public fallback preserves unbound dependency references and feedback forwards only the retained service contract", async () => {
  const state = ports();
  const owner = await loadNativeOwner("exportLogs", state, modules);
  const artifacts = { files: [], aboutContent: "fixture" };
  const calls = [];
  const clock = () => state.now;
  const failure = new Error("fixture ZIP reveal failure");
  const result = await owner.exportLogs({
    now: clock,
    getKnorviaDataDir: function () {
      assert.equal(this, undefined);
      return "fixture-source";
    },
    getExportLogDir: () => "fixture-output",
    getExportLogStageDir: () => "fixture-stage",
    createLogArchiveArtifacts: function (source, options) {
      assert.equal(this, undefined);
      assert.equal(source, "fixture-source");
      assert.equal(options.now, clock);
      return Promise.resolve(artifacts);
    },
    writeLogArchiveZip: function (path, value, options) {
      assert.equal(this, undefined);
      assert.equal(value, artifacts);
      assert.equal(options.stageRootDir, "fixture-stage");
      calls.push(["zip", path]);
      return Promise.resolve();
    },
    writeLogArchiveDirectory: function (path, value) {
      assert.equal(this, undefined);
      assert.equal(value, artifacts);
      calls.push(["directory", path]);
      return Promise.resolve();
    },
    showItemInFolder: function (path) {
      assert.equal(this, undefined);
      if (path.endsWith(".zip")) throw failure;
      calls.push(["reveal", path]);
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.path, calls[1][1]);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ["zip", "directory", "reveal"],
  );
  assert.ok(
    state.trace.some(
      ([kind, path, options]) => kind === "remove" && path.endsWith(".zip") && options.force,
    ),
  );
  const onProgress = () => {};
  const feedback = await owner.createFeedbackLogArchiveFromExportLogs("fixture-source", {
    now: clock,
    onProgress,
    outputRootDir: "fixture-feedback-root",
    get stageRootDir() {
      throw new Error("ignored legacy option");
    },
  });
  assert.deepEqual(feedback, { path: "fixture-feedback.zip", size: 17 });
  const forwarded = state.feedbackCalls[0];
  assert.equal(forwarded.now, clock);
  assert.equal(forwarded.onProgress, onProgress);
  assert.equal(Object.hasOwn(forwarded, "stageRootDir"), false);
  assert.deepEqual(forwarded.sources, [
    { directory: join("fixture-source", "logs"), archivePrefix: "logs" },
    { directory: join("fixture-data", "cli", "log"), archivePrefix: ".knorvia-studio/cli/log" },
    {
      directory: join("fixture-data", "computer-use", "run"),
      archivePrefix: ".knorvia-studio/computer-use/run",
      exitLogsOnly: true,
    },
  ]);
});
