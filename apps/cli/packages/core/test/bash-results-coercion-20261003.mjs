import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  mode = process.argv[2];
assert.ok(["baseline", "initial", "current"].includes(mode));
let text;
const name = "tool/handlers/bash-model-content";
if (mode === "current") {
  const bytes = await readFile(
    path.join(repo, "docs/evidence/knorvia-bash-results-current-20261003.json"),
  );
  assert.equal(sha(bytes), "CURRENT_PIN");
  const row = JSON.parse(bytes).files["apps/cli/packages/core/src/" + name + ".ts"];
  for (const e of Object.values(row))
    assert.equal(sha(await readFile(path.join(repo, e.path))), e.sha256);
  text = (await readFile(path.join(repo, row.compiled.path))).toString();
} else {
  const file =
    mode === "baseline"
      ? "apps/cli/packages/core/test/bash-results-baseline-20261003.json"
      : "docs/evidence/bash-results-checks-20261003/diagnostic-draft/compiled-modules.json";
  const pin =
    mode === "baseline"
      ? "b4180fb37af8689f36bc9ffc9730d286dd1ac21d7b24efc585c94a6a44c24c97"
      : "b7053054833b145320c23d07ca34085155ec080d13d822fd459d2bb91fd7893e";
  const bytes = await readFile(path.join(repo, file));
  assert.equal(sha(bytes), pin);
  const row = JSON.parse(bytes).files[name];
  assert.equal(sha(row.compiled), row.compiledSha256);
  text = row.compiled;
}
const context = vm.createContext({ Buffer }),
  unused = () => {
    throw Error("unused dependency");
  };
const definitions = {
  "@knorvia/contracts": {
    BashOutputSchema: { safeParse: () => ({ success: false }) },
    parseImageDataUrl: unused,
  },
  "../result-persistence-format.js": { formatPersistedOutputEnvelope: unused },
  "./bash-semantics.js": { isBashProviderErrorStatus: unused },
};
const module = new vm.SourceTextModule(text, { context });
await module.link((s) => {
  const x = definitions[s];
  assert.ok(x, s);
  return new vm.SyntheticModule(
    Object.keys(x),
    function () {
      for (const [k, v] of Object.entries(x)) this.setExport(k, v);
    },
    { context },
  );
});
await module.evaluate();
let coercions = 0,
  value,
  caught;
const originalError = Error("Owned first coercion failure");
const input = {
  toJSON: () => undefined,
  toString: () => {
    coercions++;
    if (coercions === 1) throw originalError;
    return "Owned second coercion";
  },
};
try {
  value = module.namespace.formatBashModelContent(input);
} catch (error) {
  caught = error;
}
const observation = { value, coercions, caughtOriginal: caught === originalError };
console.log(
  JSON.stringify({
    mode,
    observation,
    initialDraftHasSeparateTS2322Diagnostic: mode === "initial",
  }),
);
assert.deepEqual(observation, {
  value: "Owned second coercion",
  coercions: 2,
  caughtOriginal: false,
});
console.log(JSON.stringify({ mode, groups: 1, supportedUnknownInputComparisons: 1, liveIO: 0 }));
