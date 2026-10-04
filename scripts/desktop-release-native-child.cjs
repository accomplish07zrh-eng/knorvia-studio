// Adapted from docs/evidence/native-packaged-acceptance-20261003/artifact-native-child.cjs; retain SQLite and real PTY acceptance.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const [root, workspace, database, operation] = process.argv.slice(2);
const phase = (name) =>
  console.error(
    JSON.stringify({
      nativeProbePhase: name,
      node: process.version,
      electron: process.versions.electron,
      platform: process.platform,
    }),
  );
// 原生崩溃可能不产生 JS 异常，阶段标记只帮助定位，不替代任何验收断言。
phase("sqlite-open");
const db = new DatabaseSync(database);
if (operation === "write") {
  db.exec("CREATE TABLE native_smoke_sentinel (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO native_smoke_sentinel VALUES (?, ?)").run("fixture", "preserved");
} else {
  assert.equal(
    db.prepare("SELECT value FROM native_smoke_sentinel WHERE key = ?").get("fixture").value,
    "preserved",
  );
}
db.close();
phase("sqlite-closed");

if (operation !== "write") {
  console.log(JSON.stringify({ sentinel: "preserved after a second real storage preparation" }));
} else {
  const requireFromArtifact = createRequire(join(root, "resources", "app.asar", "package.json"));
  phase("pty-load");
  const pty = requireFromArtifact("node-pty");
  const windows = process.platform === "win32";
  const shell = windows ? process.env.COMSPEC : "/bin/sh";
  const args = windows
    ? ["/d", "/s", "/c", "echo knorvia_native_pty"]
    : ["-c", "printf knorvia_native_pty"];
  phase("pty-spawn");
  const term = pty.spawn(shell, args, {
    cwd: workspace,
    env: process.env,
    cols: 80,
    rows: 24,
  });
  phase("pty-spawned");
  let screen = "";
  const timer = setTimeout(() => {
    term.kill();
    throw new Error("Packaged PTY did not exit within 10s");
  }, 10000);
  term.onData((data) => {
    screen += data;
  });
  term.onExit((event) => {
    clearTimeout(timer);
    assert.equal(event.exitCode, 0);
    assert.match(screen, /knorvia_native_pty/);
    console.log(
      JSON.stringify({
        runtime: {
          node: process.version,
          electron: process.versions.electron,
          arch: process.arch,
          platform: process.platform,
        },
        resolvedPty: requireFromArtifact.resolve("node-pty"),
        pty: { exitCode: event.exitCode, output: screen },
        sentinel: "written to synthetic application session database",
      }),
    );
  });
}
