import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const [repository, suppliedExecutable, destination] = process.argv.slice(2);
const executable = resolve(suppliedExecutable);
const root = dirname(executable);
const { packagedRuntimeEvidence } = await import(pathToFileURL(join(repository, "scripts/packaged-runtime-evidence.mjs")).href);
const { parseAsarListWithPackState, findDesktopNativePackageViolations } = await import(pathToFileURL(join(repository, "packages/desktop/scripts/desktop-native-package-policy.mjs")).href);
const requireFromRepository = createRequire(join(repository, "packages/desktop/package.json"));
const asar = requireFromRepository("@electron/asar");
const asarCli = join(dirname(requireFromRepository.resolve("@electron/asar/package.json")), "bin/asar.js");
const fixture = await mkdtemp(join(dirname(destination), "native-smoke-"));
const data = join(fixture, "data");
const workspace = join(fixture, "workspace with spaces");
await mkdir(data);
await mkdir(workspace);
const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C.UTF-8",
  TERM: "xterm-256color",
  NODE_PATH: "",
  NODE_OPTIONS: "",
  ELECTRON_RUN_AS_NODE: "1",
  KNORVIA_ENV: "production",
  KNORVIA_RUNTIME_ENV: "production",
  KNORVIA_DATA_BASE_DIR: data,
  KNORVIA_HOME: join(data, ".knorvia-studio"),
  KNORVIA_STORAGE_DIR: join(data, ".knorvia-studio"),
  KNORVIA_SESSION_DB_PATH: join(data, "session.sqlite"),
  KNORVIA_BASE_URL: "http://127.0.0.1:9",
  KNORVIA_MODEL_TELEMETRY_ENABLED: "0",
};
const report = { status: "running", platform: process.platform, arch: process.arch, fixture, checks: [], limits: ["No GUI flows", "No model requests", "No Windows acceptance", "Synthetic storage sentinel is not a full legacy migration acceptance", "Selection/policy checks do not settle licensing authority"] };
const command = (file, args, extra = {}) => exec(file, args, { cwd: workspace, env, timeout: 20000, maxBuffer: 4 * 1024 * 1024, ...extra });
const cli = join(root, "resources/knorvia/knorvia.cjs");
let owned;

async function storagePreparation() {
  const child = spawn(executable, [cli, "app-server", "--stdio", "--prepare-storage", "--cwd", workspace], { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"] });
  owned = child;
  const frames = [];
  let pending = "";
  let stderr = "";
  let dbPath;
  let handlerError;
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    while (pending.includes("\n")) {
      const end = pending.indexOf("\n");
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const frame = JSON.parse(line);
        frames.push(frame);
        if (frame.method === "startup/storagePath") {
          dbPath = frame.params.path;
          const within = relative(fixture, resolve(dbPath));
          assert.ok(!isAbsolute(within) && within !== ".." && !within.startsWith(".." + sep), "Refuse acknowledgement for a non-fixture database");
          child.stdin.write(JSON.stringify({ method: "startup/storagePathReady", reuse: false }) + "\n");
        }
      } catch (error) {
        handlerError = error;
        child.kill("SIGTERM");
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ended = await new Promise((done, fail) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      fail(new Error("Real packaged storage preparation timed out: " + stderr));
    }, 20000);
    child.once("error", (error) => { clearTimeout(timer); fail(error); });
    child.once("close", (code, signal) => { clearTimeout(timer); done({ code, signal }); });
  });
  owned = undefined;
  if (handlerError) throw handlerError;
  assert.deepEqual(ended, { code: 0, signal: null }, stderr);
  assert.ok(frames.some((frame) => frame.method === "startup/storagePrepared"), JSON.stringify(frames));
  assert.ok(!frames.some((frame) => frame.params?.phase === "failed"), JSON.stringify(frames));
  assert.ok(existsSync(dbPath), "The application must create its reported database");
  return { ended, databasePath: dbPath, frames, stderr };
}

try {
  report.package = await packagedRuntimeEvidence(executable);
  report.checks.push("Canonical package identity measured outside repository");
  const listing = await command(process.execPath, [asarCli, "list", "--is-pack", report.package.appAsar.path], { env: { PATH: "/usr/bin:/bin", NODE_PATH: "", NODE_OPTIONS: "" }, maxBuffer: 64 * 1024 * 1024 });
  const entries = parseAsarListWithPackState(listing.stdout);
  const violations = findDesktopNativePackageViolations(entries, "linux-x64");
  assert.deepEqual(violations, []);
  for (const entry of ["/out/main/index.js", "/out/host/index.js", "/out/scheduler/index.js", "/out/preload/index.cjs"]) assert.ok(entries.some((item) => item.path === entry), entry);
  assert.ok(!entries.some((entry) => entry.path.endsWith(".map")));
  report.nativePolicy = { entries: entries.length, violations, requiredEntries: "main, host, scheduler, preload present; target native remains unpacked; maps absent" };
  report.metadata = JSON.parse(asar.extractFile(report.package.appAsar.path, "out/metadata/build-meta.json"));
  const productManifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
  assert.equal(report.metadata.appVersion, productManifest.version);
  report.checks.push("Existing ASAR native policy and required runtime entries passed");
  report.cliVersion = (await command(executable, [cli, "--version"])).stdout.trim();
  report.expectedCliVersion = JSON.parse(await readFile(join(repository, "apps/cli/package.json"), "utf8")).version;
  assert.equal(report.cliVersion, report.expectedCliVersion);
  report.checks.push("Packaged CLI executes in its Electron Node runtime");
  const first = await storagePreparation();
  report.storageFirst = first;
  report.native = JSON.parse((await command(executable, [join(import.meta.dirname, "artifact-native-child.cjs"), root, workspace, first.databasePath, "write"])).stdout);
  report.checks.push("Artifact node-pty opens a real PTY, renders and exits zero; Electron SQLite writes a synthetic sentinel");
  report.storageSecond = await storagePreparation();
  assert.equal(report.storageSecond.databasePath, first.databasePath);
  report.persistence = JSON.parse((await command(executable, [join(import.meta.dirname, "artifact-native-child.cjs"), root, workspace, first.databasePath, "check"])).stdout);
  report.checks.push("Real package storage handshake/preparation succeeds twice with sentinel preserved");
  const sample = join(workspace, "用户 文件.txt");
  await writeFile(sample, "first line\nknorvia_native_search_fixture\n");
  const tools = {
    ripgrep: { binary: "rg", args: ["--fixed-strings", "--line-number", "knorvia_native_search_fixture", sample] },
    ugrep: { binary: "ugrep", args: ["-F", "-n", "knorvia_native_search_fixture", sample] },
    bfs: { binary: "bfs", args: [".", "-type", "f", "-name", "*.txt"] },
  };
  report.search = {};
  for (const [name, selection] of Object.entries(tools)) {
    const dir = join(root, "resources/tools", name);
    const result = await command(join(dir, selection.binary), selection.args, { env: { ...env, ELECTRON_RUN_AS_NODE: "" } });
    assert.match(result.stdout, name === "bfs" ? /用户 文件\.txt/ : /2:knorvia_native_search_fixture/);
    const notices = await readFile(join(dir, "THIRD-PARTY-NOTICES.txt"));
    const source = await readFile(join(dir, "SOURCES.json"));
    report.search[name] = { output: result.stdout, noticeBytes: notices.length, noticeSha256: createHash("sha256").update(notices).digest("hex"), sourcesSha256: createHash("sha256").update(source).digest("hex") };
  }
  report.checks.push("Packaged rg/ugrep/bfs execute against Unicode/spaced synthetic paths with notice/source files present");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || String(error);
  process.exitCode = 1;
} finally {
  owned?.kill("SIGTERM");
  await rm(fixture, { recursive: true, force: true });
  report.fixtureRemoved = !existsSync(fixture);
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, checks: report.checks, result: destination, error: report.error }));
}
