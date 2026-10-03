import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = "licensing/evidence/desktop-command-owners-20261003";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const retained = JSON.parse(
  fs.readFileSync(directory + "/initial-retained-bindings.json", "utf8"),
).files;
for (const row of retained) assert.equal(sha(fs.readFileSync(row.path)), row.sha256, row.path);
const frozen = JSON.parse(
  fs.readFileSync(directory + "/frozen-evidence-bindings.json", "utf8"),
).files;
for (const row of frozen) assert.equal(sha(fs.readFileSync(row.path)), row.sha256, row.path);
const selected = JSON.parse(fs.readFileSync(directory + "/final-selected-freezes.json", "utf8"));
const outputs = [];
for (const [owner, [name, version]] of Object.entries(selected)) {
  const raw = `${directory}/drafts/${owner}-${version}.ts.txt`;
  const source = `packages/desktop/src/main/browserView/${name}.ts`;
  const temporary = `/tmp/knorvia-desktop-command-format-proof/${name}.ts`;
  fs.mkdirSync("/tmp/knorvia-desktop-command-format-proof", { recursive: true });
  fs.copyFileSync(raw, temporary);
  const formatted = spawnSync("node_modules/.bin/oxfmt", [temporary], { encoding: "utf8" });
  assert.equal(formatted.status, 0, formatted.stderr);
  assert.ok(fs.readFileSync(source).equals(fs.readFileSync(temporary)), source);
  outputs.push({
    owner,
    raw,
    rawSha256: sha(fs.readFileSync(raw)),
    installed: source,
    installedSha256: sha(fs.readFileSync(source)),
    formattedFrozenEqualsInstalled: true,
  });
}
const report = {
  retainedTrackedFiles: retained.length,
  unselectedDesktopFiles: retained.filter((row) => row.path.startsWith("packages/desktop/")).length,
  unselectedCliFiles: retained.filter((row) => row.path.startsWith("apps/cli/")).length,
  frozenEvidenceFiles: frozen.length,
  outputs,
  curatorProductionEdits: "Complete literal copies and formatting only",
};
fs.writeFileSync(
  directory + "/final-source-retention-proof.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(report));
