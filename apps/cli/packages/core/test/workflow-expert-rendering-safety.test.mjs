import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
assert.equal(
  createHash("sha256")
    .update(
      fs.readFileSync(new URL("./workflow-expert-prompt-rendering-baseline.json", import.meta.url)),
    )
    .digest("hex"),
  "90c1499b14a722461f460f15cbd4b4230a1fb360680ac144883d6721ac80ab1e",
);
assert.equal(
  createHash("sha256")
    .update(
      fs.readFileSync(new URL("./workflow-expert-prompt-rendering-current.json", import.meta.url)),
    )
    .digest("hex"),
  "0b92ffc7a1350dfe2b2149d39fa10384a2efb67d741a7b922c76931cbb2d9430",
);
const root = new URL("../../../../../", import.meta.url),
  core = new URL("../", import.meta.url);
const hash = (x) => createHash("sha256").update(x).digest("hex");
const current = JSON.parse(
  fs.readFileSync(new URL("test/workflow-expert-prompt-rendering-current.json", core)),
);
const historical = JSON.parse(
  fs.readFileSync(new URL("test/workflow-expert-prompt-rendering-baseline.json", core)),
);
function select(p) {
  assert.equal(hash(fs.readFileSync(new URL(p.path, root))), p.sha256, p.path);
}
for (const module of Object.values(current.files))
  for (const record of Object.values(module)) select(record);
assert.throws(() => select({ ...current.files.prompts.compiled, sha256: "0".repeat(64) }));
assert.throws(() => select({ path: "missing-owned-prompt.js", sha256: "0".repeat(64) }));
for (const module of Object.values(historical.files))
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(hash(module[kind]), module[kind + "Sha256"]);
const bind = (text) =>
  text.replace(
    /from "([^"]+)"/gu,
    (_, path) => `from ${JSON.stringify(new URL("dist/workflow/expert/" + path, core).href)}`,
  );
const old = await import(
  "data:text/javascript;base64," +
    Buffer.from(bind(historical.files.prompts.compiled)).toString("base64")
);
const now = await import(new URL(current.files.prompts.compiled.path, root));
const input = {
  runId: "owned",
  task: "Owned task",
  status: "pending",
  cwd: "owned",
  createdAt: "owned-time",
  updatedAt: "owned-time",
  phases: [],
  activities: [],
  artifacts: [],
};
assert.equal(now.buildReport(input), old.buildReport(input));
assert.equal(Buffer.byteLength(now.buildReport(input)), 163);
console.log(
  JSON.stringify({
    mode: "actual compiler-emitted owner; unchanged dependencies via tsx",
    pairedArtifactCheck: "pass",
    observations: 1,
    selectors: "exact historical/current, wrong/missing reject",
  }),
);
