// Adapted from the retained canonical native acceptance probe in docs/evidence/native-packaged-acceptance-20261003.
// Existing assertions stay, with platform-specific PTY/search paths and exact release source metadata binding.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export async function probePackagedRuntime({
  repository,
  suppliedExecutable,
  fixtureParent,
  deliveredSha,
  profileBase,
  expectedPortable,
}) {
  const exec = promisify(execFile);
  const executable = resolve(suppliedExecutable);
  const root = dirname(executable);
  const { packagedRuntimeEvidence } = await import(
    pathToFileURL(join(repository, "scripts/packaged-runtime-evidence.mjs")).href
  );
  const { parseAsarListWithPackState, findDesktopNativePackageViolations } = await import(
    pathToFileURL(join(repository, "packages/desktop/scripts/desktop-native-package-policy.mjs"))
      .href
  );
  const requireFromRepository = createRequire(join(repository, "packages/desktop/package.json"));
  const asar = requireFromRepository("@electron/asar");
  const asarCli = join(
    dirname(requireFromRepository.resolve("@electron/asar/package.json")),
    "bin/asar.js",
  );
  const fixture = await mkdtemp(join(fixtureParent, "native-smoke-"));
  const data = profileBase || join(fixture, "data");
  const ownedDataPath = relative(fixtureParent, data);
  assert.ok(
    !isAbsolute(ownedDataPath) && ownedDataPath !== ".." && !ownedDataPath.startsWith(".." + sep),
    "Release runtime probe can only use its owned fixture data",
  );
  const workspace = join(fixture, "workspace with spaces");
  await mkdir(data, { recursive: true });
  await mkdir(workspace);
  const env = {
    PATH: process.platform === "win32" ? join(process.env.SystemRoot, "System32") : "/usr/bin:/bin",
    ...(process.platform === "win32"
      ? {
          SystemRoot: process.env.SystemRoot,
          COMSPEC: process.env.ComSpec || join(process.env.SystemRoot, "System32/cmd.exe"),
          APPDATA: join(fixture, "appdata"),
          LOCALAPPDATA: join(fixture, "localappdata"),
          TEMP: fixture,
          TMP: fixture,
        }
      : {}),
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
  const report = {
    status: "running",
    deliveredSha,
    platform: process.platform,
    arch: process.arch,
    fixture,
    checks: [],
    limits: [
      "No GUI flows",
      "No model requests",
      "Synthetic storage sentinel is not a full legacy migration acceptance",
      "Selection/policy checks do not settle licensing authority",
    ],
  };
  const command = (file, args, extra = {}) =>
    exec(file, args, { cwd: workspace, env, timeout: 20000, maxBuffer: 4 * 1024 * 1024, ...extra });
  const cli = join(root, "resources/knorvia/knorvia.cjs");
  let owned;

  async function storagePreparation() {
    const child = spawn(
      executable,
      [cli, "app-server", "--stdio", "--prepare-storage", "--cwd", workspace],
      { cwd: workspace, env, stdio: ["pipe", "pipe", "pipe"] },
    );
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
            const within = relative(data, resolve(dbPath));
            assert.ok(
              !isAbsolute(within) && within !== ".." && !within.startsWith(".." + sep),
              "Refuse acknowledgement for a non-fixture database",
            );
            child.stdin.write(
              JSON.stringify({ method: "startup/storagePathReady", reuse: false }) + "\n",
            );
          }
        } catch (error) {
          handlerError = error;
          child.kill("SIGTERM");
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const ended = await new Promise((done, fail) => {
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        fail(new Error("Real packaged storage preparation timed out: " + stderr));
      }, 20000);
      child.once("error", (error) => {
        clearTimeout(timer);
        fail(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        done({ code, signal });
      });
    });
    owned = undefined;
    if (handlerError) throw handlerError;
    assert.deepEqual(ended, { code: 0, signal: null }, stderr);
    assert.ok(
      frames.some((frame) => frame.method === "startup/storagePrepared"),
      JSON.stringify(frames),
    );
    assert.ok(!frames.some((frame) => frame.params?.phase === "failed"), JSON.stringify(frames));
    assert.ok(existsSync(dbPath), "The application must create its reported database");
    return { ended, databasePath: dbPath, frames, stderr };
  }

  try {
    report.package = await packagedRuntimeEvidence(executable);
    const portableMarker = join(root, "resources/knorvia-portable.json");
    if (expectedPortable !== undefined) assert.equal(existsSync(portableMarker), expectedPortable);
    report.checks.push("Canonical package identity measured outside repository");
    const listing = await command(
      process.execPath,
      [asarCli, "list", "--is-pack", report.package.appAsar.path],
      { env: { ...env, ELECTRON_RUN_AS_NODE: "" }, maxBuffer: 64 * 1024 * 1024 },
    );
    const entries = parseAsarListWithPackState(listing.stdout);
    const violations = findDesktopNativePackageViolations(entries, `${process.platform}-x64`);
    assert.deepEqual(violations, []);
    for (const entry of [
      "/out/main/index.js",
      "/out/host/index.js",
      "/out/scheduler/index.js",
      "/out/preload/index.cjs",
    ])
      assert.ok(
        entries.some((item) => item.path === entry),
        entry,
      );
    assert.ok(!entries.some((entry) => entry.path.endsWith(".map")));
    report.nativePolicy = {
      entries: entries.length,
      violations,
      requiredEntries:
        "main, host, scheduler, preload present; target native remains unpacked; maps absent",
    };
    report.metadata = JSON.parse(
      // ASAR 按宿主 path.sep 查找目录；Windows 不能传 POSIX 分隔符。
      asar.extractFile(report.package.appAsar.path, join("out", "metadata", "build-meta.json")),
    );
    const productManifest = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
    assert.equal(report.metadata.appVersion, productManifest.version);
    assert.match(report.metadata.buildCommitId, /^[a-f0-9]{8,40}$/);
    assert.ok(
      deliveredSha.startsWith(report.metadata.buildCommitId),
      "Actual build metadata must bind the delivered SHA",
    );
    const appManifest = JSON.parse(asar.extractFile(report.package.appAsar.path, "package.json"));
    assert.equal(appManifest.author.email, "accomplish07zrh@gmail.com");
    assert.equal(appManifest.license, "Apache-2.0");
    report.legalPayload = {};
    for (const [packaged, source] of [
      ["LICENSE.knorvia.txt", "LICENSE"],
      ["NOTICE.md", "NOTICE.md"],
      ["THIRD-PARTY-NOTICES.md", "THIRD-PARTY-NOTICES.md"],
      ["licensing/MIT.txt", "licensing/MIT.txt"],
      ["licenses/lobe-icons-LICENSE.txt", "third-party/ui/lobe-icons-LICENSE.txt"],
    ]) {
      const bytes = await readFile(join(root, "resources", packaged));
      assert.deepEqual(bytes, await readFile(join(repository, source)), packaged);
      report.legalPayload[packaged] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
    report.checks.push("Existing ASAR native policy and required runtime entries passed");
    report.cliVersion = (await command(executable, [cli, "--version"])).stdout.trim();
    report.expectedCliVersion = JSON.parse(
      await readFile(join(repository, "apps/cli/package.json"), "utf8"),
    ).version;
    assert.equal(report.cliVersion, report.expectedCliVersion);
    report.checks.push("Packaged CLI executes in its Electron Node runtime");
    const first = await storagePreparation();
    report.storageFirst = first;
    report.native = JSON.parse(
      (
        await command(executable, [
          join(import.meta.dirname, "desktop-release-native-child.cjs"),
          root,
          workspace,
          first.databasePath,
          "write",
        ])
      ).stdout,
    );
    report.checks.push(
      "Artifact node-pty opens a real PTY, renders and exits zero; Electron SQLite writes a synthetic sentinel",
    );
    report.storageSecond = await storagePreparation();
    assert.equal(report.storageSecond.databasePath, first.databasePath);
    report.persistence = JSON.parse(
      (
        await command(executable, [
          join(import.meta.dirname, "desktop-release-native-child.cjs"),
          root,
          workspace,
          first.databasePath,
          "check",
        ])
      ).stdout,
    );
    report.checks.push(
      "Real package storage handshake/preparation succeeds twice with sentinel preserved",
    );
    const sample = join(workspace, "用户 文件.txt");
    await writeFile(sample, "first line\nknorvia_native_search_fixture\n");
    const tools = {
      ripgrep: {
        binary: "rg",
        args: ["--fixed-strings", "--line-number", "knorvia_native_search_fixture", sample],
      },
      ugrep: { binary: "ugrep", args: ["-F", "-n", "knorvia_native_search_fixture", sample] },
      bfs: { binary: "bfs", args: [".", "-type", "f", "-name", "*.txt"] },
    };
    if (process.platform === "win32") delete tools.bfs;
    report.search = {};
    for (const [name, selection] of Object.entries(tools)) {
      const dir = join(root, "resources/tools", name);
      const result = await command(
        join(dir, selection.binary + (process.platform === "win32" ? ".exe" : "")),
        selection.args,
        { env: { ...env, ELECTRON_RUN_AS_NODE: "" } },
      );
      assert.match(
        result.stdout,
        name === "bfs" ? /用户 文件\.txt/ : /2:knorvia_native_search_fixture/,
      );
      const notices = await readFile(join(dir, "THIRD-PARTY-NOTICES.txt"));
      const source = await readFile(join(dir, "SOURCES.json"));
      report.search[name] = {
        output: result.stdout,
        noticeBytes: notices.length,
        noticeSha256: createHash("sha256").update(notices).digest("hex"),
        sourcesSha256: createHash("sha256").update(source).digest("hex"),
      };
    }
    report.checks.push(
      "Platform-native packaged search tools execute against Unicode/spaced synthetic paths with notice/source files present",
    );
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack || String(error);
  } finally {
    owned?.kill("SIGTERM");
    await rm(fixture, { recursive: true, force: true });
    report.fixtureRemoved = !existsSync(fixture);
  }

  if (report.status !== "passed") throw Object.assign(new Error(report.error), { report });
  return report;
}
