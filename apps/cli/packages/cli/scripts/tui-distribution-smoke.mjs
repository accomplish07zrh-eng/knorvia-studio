// Exercise the real staged CLI/TUI outside the repository without sending a prompt.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const renderTimeoutMs = 20_000;
const importTimeoutMs = 30_000;
const keyboardExitTimeoutMs = 8_000;
const pollIntervalMs = 100;
const secondInterruptDelayMs = 200;
const runtimeEnvironmentKeys = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
]);

export async function smokePackagedTui(packageDirectory) {
  const root = await realpath(resolve(packageDirectory));
  const directory = await realpath(await mkdtemp(join(tmpdir(), "knorvia-tui-smoke-")));
  const workspace = join(directory, "workspace");
  const runner = join(root, "bin/knorvia.mjs");
  const dataBaseDir = join(directory, "data");
  const storageDirectory = join(dataBaseDir, ".knorvia-studio", "cli");
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => runtimeEnvironmentKeys.has(key.toUpperCase())),
    ),
    KNORVIA_DATA_BASE_DIR: dataBaseDir,
    // The existing default sessionDbPath is an explicit ~/ path. Isolate it too;
    // DATA_BASE_DIR alone must not rewrite the product's user-path semantics.
    KNORVIA_SESSION_DB_PATH: join(storageDirectory, "db", "db.sqlite"),
    KNORVIA_STORAGE_DIR: storageDirectory,
    NODE_OPTIONS: "",
    NODE_PATH: "",
    TERM: "xterm-256color",
  };
  let runtimeCheckDirectory;
  let terminal;
  try {
    await mkdir(workspace);
    await exec(process.execPath, [runner, "--help"], {
      cwd: workspace,
      env,
      timeout: importTimeoutMs,
    });
    const version = (
      await exec(process.execPath, [runner, "--version"], {
        cwd: workspace,
        env,
        timeout: importTimeoutMs,
      })
    ).stdout.trim();
    runtimeCheckDirectory = await mkdtemp(join(root, "agent/tui-import-smoke-"));
    const runtimeCheck = join(runtimeCheckDirectory, "check.mjs");
    await writeFile(
      runtimeCheck,
      `import { runTui } from "@knorvia/tui";
      if (typeof runTui !== "function") throw new Error("Missing TUI export");
      if (typeof globalThis.require !== "undefined") throw new Error("Global require injection");
      console.log("tui-runtime-ok");`,
    );
    const imported = await exec(process.execPath, [runtimeCheck], {
      cwd: workspace,
      env,
      timeout: importTimeoutMs,
    });
    assert.match(imported.stdout, /tui-runtime-ok/);

    const require = createRequire(join(root, "package.json"));
    const pty = require("node-pty");
    terminal = pty.spawn(process.execPath, [runner], { cwd: workspace, env, cols: 110, rows: 32 });
    let screen = "";
    let terminalExit;
    terminal.onData((data) => {
      screen += data;
    });
    const exited = new Promise((done) =>
      terminal.onExit((event) => {
        terminalExit = event;
        done(event);
      }),
    );
    const deadline = Date.now() + renderTimeoutMs;
    // Use the same render/keyboard acceptance as the root distribution smoke.
    while (!(/Knorvia/.test(screen) && /(?:登录|\/login|输入提示词|Type a prompt)/i.test(screen))) {
      assert.equal(terminalExit, undefined, screen);
      if (Date.now() >= deadline) throw new Error(`TUI initialized render timed out:\n${screen}`);
      await setTimeout(pollIntervalMs);
    }
    assert.equal(terminalExit, undefined, screen);
    assert.doesNotMatch(
      screen,
      /Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|Dynamic require of/,
    );
    const initializedScreen = screen;
    terminal.write("\u0003");
    await setTimeout(secondInterruptDelayMs);
    if (!terminalExit) terminal.write("\u0003");
    const timeout = new AbortController();
    let tuiExit;
    try {
      tuiExit = await Promise.race([
        exited,
        setTimeout(keyboardExitTimeoutMs, undefined, { signal: timeout.signal }).then(() => {
          throw new Error("TUI keyboard exit timed out");
        }),
      ]);
    } finally {
      timeout.abort();
    }
    assert.equal(tuiExit.exitCode, 0, screen);
    terminal = undefined;

    const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const artifacts = [];
    for (const path of [
      "bin/knorvia.mjs",
      "agent/knorvia.cjs",
      "agent/node_modules/@knorvia/tui/dist/index.js",
    ]) {
      artifacts.push({ path, sha256: sha256(await readFile(join(root, path))) });
    }
    return {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      version,
      isolated: true,
      environment:
        "allowlisted OS runtime keys; empty NODE_OPTIONS/NODE_PATH; synthetic workspace/data; no provider credentials or prompt",
      help: "passed",
      nativeImport: "passed; global require absent",
      initializedRender: "passed; unchanged root smoke markers",
      keyboardExit: tuiExit,
      initializedScreenSha256: sha256(initializedScreen),
      artifacts,
      qualification:
        "Host-target staged CLI/TUI runtime smoke. No Web/server/desktop build or complete distribution/archive/SEA acceptance.",
    };
  } finally {
    terminal?.kill();
    if (runtimeCheckDirectory) await rm(runtimeCheckDirectory, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2], "Usage: node tui-distribution-smoke.mjs <staged-package-root>");
  console.log(JSON.stringify(await smokePackagedTui(process.argv[2]), null, 2));
}
