import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = "licensing/evidence/desktop-host-index-owner-20261003";
const raw = `${directory}/drafts/index-correction-3.ts.txt`;
const installed = "packages/desktop/src/host/index.ts";
const temporary = "/tmp/knorvia-host-index-frozen-format-proof/index.ts";
fs.mkdirSync("/tmp/knorvia-host-index-frozen-format-proof", { recursive: true });
fs.copyFileSync(raw, temporary);
const formatted = spawnSync("node_modules/.bin/oxfmt", [temporary], { encoding: "utf8" });
process.stdout.write(formatted.stdout ?? "");
process.stderr.write(formatted.stderr ?? "");
assert.equal(formatted.status, 0);
assert.ok(
  fs.readFileSync(temporary).equals(fs.readFileSync(installed)),
  "installed owner differs from independently formatted raw whole draft",
);
const sha = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
console.log(
  JSON.stringify({
    raw,
    rawSha256: sha(raw),
    installed,
    installedSha256: sha(installed),
    independentlyFormattedFrozenMatches: true,
    curatorProductEdits: "Whole copy and formatting only",
  }),
);
