import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const directory = "licensing/evidence/desktop-host-index-owner-20261003";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
for (const [input, output] of [
  ["initial-retained-desktop-bindings", "final-retained-desktop-bindings"],
  ["retained-cli-bindings", "final-retained-cli-bindings"],
  ["protected-global-bindings", "final-protected-global-bindings"],
]) {
  const baseline = JSON.parse(fs.readFileSync(`${directory}/${input}.json`, "utf8"));
  const rows = Array.isArray(baseline) ? baseline : baseline.files;
  assert.ok(Array.isArray(rows));
  const current = rows.map(({ path, sha256 }) => {
    const actual = sha(fs.readFileSync(path));
    assert.equal(actual, sha256, path);
    return { path, sha256: actual };
  });
  fs.writeFileSync(
    `${directory}/${output}.json`,
    JSON.stringify({ retainedCount: current.length, files: current, unchanged: true }, null, 2) +
      "\n",
    { flag: "wx" },
  );
  console.log(`${input}: ${current.length} hash-only bindings unchanged`);
}
const protectedFiles = JSON.parse(
  fs.readFileSync(`${directory}/protected-hash-bindings.json`, "utf8"),
).hashOnlyNoBodyInspection;
for (const [path, digest] of Object.entries(protectedFiles))
  assert.equal(sha(fs.readFileSync(path)), digest, path);
const ledger = JSON.parse(fs.readFileSync(`${directory}/retained-cli-ledger.json`, "utf8"));
for (const { path, sha256 } of ledger.retainedPaths)
  assert.equal(sha(fs.readFileSync(path)), sha256, path);
fs.writeFileSync(
  `${directory}/final-retained-cli-ledger.json`,
  JSON.stringify({ ...ledger, batch39SourceUnchanged: true }, null, 2) + "\n",
  { flag: "wx" },
);
for (const [path, digest] of Object.entries({
  "packages/desktop/src/host/studioScheduleOutcome.ts":
    "32bcc46002bca19b3dbc58a4731ea7629c4b1add6ae05cb66f86e0595b43ad52",
  "packages/desktop/src/host/studioWorkflowSchedule.ts":
    "62711d1acae4767ba34b0bb8d8eb87d2ee2ad27a85bc52e495271fbafc4460eb",
}))
  assert.equal(sha(fs.readFileSync(path)), digest, path);
console.log(
  "Three protected shared bodies hash-only; both schedule sources exact root hashes; prior CLI ledger preserved with zero reclassification.",
);
