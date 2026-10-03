import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export { fixture, trace } from "./steering-subagent-ports-20261003.mjs";
export async function load(mode, fixture) {
  const oldBytes = fs.readFileSync(
    path.join(repo, "apps/cli/packages/core/test/steering-subagent-baseline-20261003.json"),
  );
  assert.equal(hash(oldBytes), "ca03acb0d6b1510c32235ddc78921e27ef74bff19dba54e0bd3eab246b131151");
  const old = JSON.parse(oldBytes);
  for (const row of Object.values(old.files))
    for (const k of ["source", "compiled", "declaration"])
      assert.equal(hash(row[k]), row[k + "Sha256"]);
  let files = old.files;
  if (mode === "current") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-steering-subagent-current-20261003.json"),
    );
    assert.equal(hash(bytes), "CURRENT_PIN");
    files = {};
    for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
      files[name] = {};
      for (const [kind, entry] of Object.entries(row)) {
        const bytes = fs.readFileSync(path.join(repo, entry.path));
        assert.equal(hash(bytes), entry.sha256);
        files[name][kind] = bytes.toString();
      }
    }
  } else if (mode === "rejectedDraft") {
    const bytes = fs.readFileSync(
      path.join(
        repo,
        "docs/evidence/steering-subagent-checks-20261003/rejected-draft-emission.json",
      ),
    );
    assert.equal(hash(bytes), "516e978c3c98422cb7f7642edc143798bab8989a726bd47aa744b312a7b22c8d");
    const result = JSON.parse(bytes);
    assert.equal(result.diagnostics.length, 15);
    assert.equal(result.apiEqual, false);
    files = result.files;
  } else if (mode === "draft") {
    const bytes = fs.readFileSync(process.argv[3]);
    assert.equal(hash(bytes), "DRAFT_PIN");
    const result = JSON.parse(bytes);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.apiEqual, true);
    files = result.files;
  } else assert.equal(mode, "baseline");
  class OwnedDate extends Date {
    constructor(value = 0) {
      super(value);
    }
    static now() {
      return 100;
    }
  }
  const context = vm.createContext({
    Date: OwnedDate,
    Error,
    Map,
    Set,
    WeakMap,
    Boolean,
    String,
    Number,
    Math,
    Array,
    Promise,
  });
  const synthetic = (id, exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      },
      { context, identifier: id },
    );
  const modules = new Map(
    Object.entries(fixture.modules).map(([id, exports]) => [id, synthetic(id, exports)]),
  );
  for (const [name, row] of Object.entries(files)) {
    const id = "runtime/methods/" + name.replace(/\.ts$/u, ".js");
    modules.set(id, new vm.SourceTextModule(row.compiled, { context, identifier: id }));
  }
  const link = (specifier, parent) => {
    const id = specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
      : specifier;
    assert.ok(modules.has(id), "Unselected boundary: " + id);
    return modules.get(id);
  };
  for (const name of ["steering", "subagent"]) {
    const module = modules.get("runtime/methods/" + name + ".js");
    if (module.status === "unlinked") await module.link(link);
    if (module.status === "linked") await module.evaluate();
    Object.assign(fixture.runtime, module.namespace);
  }
  return fixture.runtime;
}
