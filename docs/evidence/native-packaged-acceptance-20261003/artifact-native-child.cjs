const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const [root, workspace, database, operation] = process.argv.slice(2);
const db = new DatabaseSync(database);
if (operation === "write") {
  db.exec("CREATE TABLE native_smoke_sentinel (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO native_smoke_sentinel VALUES (?, ?)").run("fixture", "preserved");
} else {
  assert.equal(db.prepare("SELECT value FROM native_smoke_sentinel WHERE key = ?").get("fixture").value, "preserved");
}
db.close();

if (operation !== "write") {
  console.log(JSON.stringify({ sentinel: "preserved after a second real storage preparation" }));
} else {
  const requireFromArtifact = createRequire(join(root, "resources", "app.asar", "package.json"));
  const pty = requireFromArtifact("node-pty");
  const term = pty.spawn("/bin/sh", ["-c", "printf knorvia_native_pty"], {
    cwd: workspace,
    env: process.env,
    cols: 80,
    rows: 24,
  });
  let screen = "";
  const timer = setTimeout(() => {
    term.kill();
    throw new Error("Packaged PTY did not exit within 10s");
  }, 10000);
  term.onData((data) => { screen += data; });
  term.onExit((event) => {
    clearTimeout(timer);
    assert.equal(event.exitCode, 0);
    assert.equal(screen, "knorvia_native_pty");
    console.log(JSON.stringify({
      runtime: { node: process.version, electron: process.versions.electron, arch: process.arch, platform: process.platform },
      resolvedPty: requireFromArtifact.resolve("node-pty"),
      pty: { exitCode: event.exitCode, output: screen },
      sentinel: "written to synthetic application session database",
    }));
  });
}
