import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
assert.equal(
  createHash("sha256")
    .update(
      fs.readFileSync(
        new URL("./workflow-expert-parser-normalization-baseline.json", import.meta.url),
      ),
    )
    .digest("hex"),
  "066ef0fa49fd0ef1d656c4068d8c383ca148b2e39d1dcab117b62192cb0dac58",
);
assert.equal(
  createHash("sha256")
    .update(
      fs.readFileSync(
        new URL("./workflow-expert-parser-normalization-current.json", import.meta.url),
      ),
    )
    .digest("hex"),
  "4ebf7addf0a508092ed280e648cd9a787697dcd73f054df993af70f478247fea",
);
// 根保持 file URL，避免 Windows 双盘符和空格等路径编码被当作文件名。
const root = new URL("../../../../../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const current = JSON.parse(
  fs.readFileSync(new URL("./workflow-expert-parser-normalization-current.json", import.meta.url)),
);
const historical = JSON.parse(
  fs.readFileSync(new URL("./workflow-expert-parser-normalization-baseline.json", import.meta.url)),
);
function check(record) {
  assert.equal(
    sha(fs.readFileSync(new URL(record.path, root))),
    record.sha256,
    `Exact artifact: ${record.path}`,
  );
}
for (const module of Object.values(current.files))
  for (const record of Object.values(module)) check(record);
assert.throws(() =>
  check({ ...current.files["parsers/graph-seed"].compiled, sha256: "0".repeat(64) }),
);
assert.throws(() => check({ path: "missing-owned-parser-artifact.js", sha256: "0".repeat(64) }));
for (const module of Object.values(historical.files))
  for (const kind of ["source", "compiled", "declaration"])
    assert.equal(sha(module[kind]), module[kind + "Sha256"]);
const baseline = historical.files["parsers/graph-seed"];
const rewrite = (text) =>
  text
    .replaceAll(
      '"@knorvia/contracts"',
      JSON.stringify(new URL("apps/cli/packages/contracts/dist/index.js", root).href),
    )
    .replaceAll(
      '"../ids.js"',
      JSON.stringify(
        new URL("apps/cli/packages/core/dist/workflow/expert/ids.js", root).href,
      ),
    )
    .replaceAll(
      '"./json.js"',
      JSON.stringify(
        new URL("apps/cli/packages/core/dist/workflow/expert/parsers/json.js", root).href,
      ),
    );
const old = await import(
  "data:text/javascript;base64," + Buffer.from(rewrite(baseline.compiled)).toString("base64")
);
const now = await import(new URL(current.files["parsers/graph-seed"].compiled.path, root).href);
const input = [{ id: " ", from: "a", to: "b" }];
assert.deepEqual(
  now.normalizeWorkflowGraphSeedCandidate(input, "p"),
  old.normalizeWorkflowGraphSeedCandidate(input, "p"),
);
const node = { id: "x", dependsOn: [] },
  peer = { id: "x", dependsOn: ["other"] };
const seed = { nodes: [node, peer], edges: [], collections: [] };
const a = old.gateRootSeedNodes(seed, "gate"),
  b = now.gateRootSeedNodes(seed, "gate");
assert.deepEqual(b, a);
assert.notEqual(b.nodes[1], peer);
assert.equal(b.collections, seed.collections);
assert.deepEqual(seed.nodes[1].dependsOn, ["other"]);
console.log(
  JSON.stringify({
    mode: "actual compiler-emitted owner, workspace dependencies via tsx",
    pairedSafetyCheck: "pass",
    observations: 2,
    selectors: "exact current and historical; wrong/missing reject",
  }),
);
