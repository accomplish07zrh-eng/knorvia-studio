// SPDX-License-Identifier: MIT
// Regression contract: mixed platform constraints cannot authorize missing packages
// unless the pinned pnpm selection is established; uncertain selection fails closed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProductionGraphs, missingProductionPackages } from "../third-party-npm.mjs";

// Frozen observations from pnpm 10.33.2 package-is-installable/checkPlatform.checkList.
// The first row was also verified with a real offline local-tarball pnpm install.
// This is a selection oracle, not a claim about published artifacts or license terms.
const oracle = [
  { wanted: ["linux", "!android"], selected: ["darwin", "win32"], pnpmSelected: true },
  { wanted: ["linux", "!android"], selected: ["darwin"], pnpmSelected: false },
  { wanted: ["linux", "!android"], selected: ["darwin", "win32", "aix"], pnpmSelected: false },
  {
    wanted: ["linux", "darwin", "!android"],
    selected: ["aix", "win32", "freebsd"],
    pnpmSelected: true,
  },
  {
    wanted: ["linux", "darwin", "win32", "!android"],
    selected: ["freebsd", "freebsd", "aix", "sunos"],
    pnpmSelected: true,
  },
  { wanted: ["linux", "!android"], selected: ["linux"], pnpmSelected: true },
  { wanted: ["linux", "!android"], selected: ["linux", "android"], pnpmSelected: false },
];
const project = (deps = {}, optional = true) => [
  {
    name: "@knorvia/qa",
    [optional ? "optionalDependencies" : "dependencies"]: deps,
  },
];
const dependency = { name: "qa-native", version: "1.0.0" };
const key = "qa-native@1.0.0";
function policy(field, wanted, selected) {
  return {
    metadata: new Map([[key, { [field]: wanted }]]),
    host: { os: "linux", cpu: "x64", libc: "glibc" },
    supportedArchitectures: { os: ["linux"], cpu: ["x64"], libc: ["glibc"], [field]: selected },
    includeOptional: true,
  };
}
for (const field of ["os", "cpu", "libc"]) {
  for (const [index, observation] of oracle.entries()) {
    test(`${field} mixed selection oracle ${index}: selected=${observation.pnpmSelected}, unknown stays required`, () => {
      const p = policy(field, observation.wanted, observation.selected);
      assert.throws(
        () => assertProductionGraphs(project({ native: dependency }), project(), p),
        /Missing: qa-native@1\.0\.0/,
      );
      const required = assertProductionGraphs(
        project({ native: dependency }),
        project({ native: dependency }),
        p,
      );
      assert.equal(required.get(key).omissionReason, undefined);
      assert.throws(
        () => missingProductionPackages(required, new Map()),
        /Missing installed dependency/,
      );
    });
  }
}
test("an independently excluded platform dimension still proves an optional omission", () => {
  const p = policy("os", ["linux", "!android"], ["darwin", "win32"]);
  p.metadata.set(key, { os: ["linux", "!android"], cpu: ["arm64"] });
  const required = assertProductionGraphs(project({ native: dependency }), project(), p);
  assert.match(required.get(key).omissionReason, /cpu/);
});
test("unambiguous libc exclusion and any required path retain existing semantics", () => {
  const p = policy("libc", ["musl"], ["glibc"]);
  const required = assertProductionGraphs(project({ native: dependency }), project(), p);
  assert.match(required.get(key).omissionReason, /libc/);
  assert.throws(
    () => assertProductionGraphs(project({ native: dependency }, false), project(), p),
    /Missing/,
  );
});
