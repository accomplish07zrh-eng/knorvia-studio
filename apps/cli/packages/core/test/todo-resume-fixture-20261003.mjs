import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const core = path.join(repo, "apps/cli/packages/core");
export const contracts = Object.assign(
  {},
  ...(await Promise.all(
    [
      "tools/todo",
      "errors/index",
      "events/session.events",
      "hooks/index",
      "interfaces/session-store.port",
    ].map((name) => import(path.join(core, "../contracts/dist/" + name + ".js"))),
  )),
);
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const plain = (value) => JSON.parse(JSON.stringify(value));
export const trace = { traceId: "owned-trace", spanId: "owned-span" };
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function load(mode, name, ports = {}) {
  const bytes = fs.readFileSync(path.join(core, "test/todo-resume-baseline-20261003.json"));
  assert.equal(hash(bytes), "4055a0d0225fee5c8aa3fe46f5c1367b9c5eb8a19a597606ae42294db8353e0d");
  const old = JSON.parse(bytes);
  for (const row of Object.values(old.files))
    for (const key of ["source", "compiled", "declaration"])
      assert.equal(hash(row[key]), row[key + "Sha256"]);
  let files = old.files;
  if (mode === "current") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-todo-resume-current-20261003.json"),
    );
    assert.equal(hash(bytes), "2d5d04b499c6d6aaaded5b43d27d8627f9ad03c03c6bf561091cb8d90ec7e7eb");
    files = {};
    for (const [key, row] of Object.entries(JSON.parse(bytes).files)) {
      files[key] = { location: row.location };
      for (const part of ["source", "compiled", "declaration"]) {
        const b = fs.readFileSync(path.join(repo, row[part].path));
        assert.equal(hash(b), row[part].sha256, row[part].path);
        files[key][part] = b.toString();
      }
    }
  } else assert.equal(mode, "baseline");
  const context = vm.createContext({ Error, Map, Set, Promise, String, Boolean, Date });
  const modules = new Map(
    Object.entries({ "@knorvia/contracts": contracts, ...ports }).map(([id, exports]) => [
      id,
      new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        },
        { context, identifier: id },
      ),
    ]),
  );
  for (const row of Object.values(files)) {
    const id = row.location.replace(/\.ts$/u, ".js");
    modules.set(id, new vm.SourceTextModule(row.compiled, { context, identifier: id }));
  }
  const module = modules.get(files[name].location.replace(/\.ts$/u, ".js"));
  await module.link((specifier, parent) => {
    const id = specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
      : specifier;
    assert.ok(modules.has(id), "Unselected dependency: " + id);
    return modules.get(id);
  });
  await module.evaluate();
  return module.namespace;
}
