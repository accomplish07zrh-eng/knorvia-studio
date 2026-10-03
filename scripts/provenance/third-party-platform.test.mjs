// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProductionGraphs, missingProductionPackages } from "../third-party-npm.mjs";
import {
  readLockedPlatformMetadata,
  readOptionalInstallSnapshot,
  readLockedOptionalEdges,
} from "../third-party-platform.mjs";

const node = (name, version = "1.0.0") => ({ name, version });
const graph = (names, optional = true) => [
  {
    name: "@knorvia/fixture",
    [optional ? "optionalDependencies" : "dependencies"]: Object.fromEntries(
      names.map((name) => [name, node(name)]),
    ),
  },
];
const variants = ["fixture-gnu", "fixture-musl"];
const policy = (libc = ["current", "glibc"]) => ({
  metadata: new Map(
    variants.map((name, i) => [
      `${name}@1.0.0`,
      { os: ["linux"], cpu: ["x64"], libc: [i ? "musl" : "glibc"] },
    ]),
  ),
  supportedArchitectures: { os: ["current"], cpu: ["current"], libc },
  host: { os: "linux", cpu: "x64", libc: "glibc" },
  includeOptional: true,
});

test("glibc selection explicitly records the omitted musl optional version", () => {
  const required = assertProductionGraphs(graph(variants), graph([variants[0]]), policy());
  const missing = missingProductionPackages(required, new Map([["fixture-gnu@1.0.0", {}]]));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, "fixture-musl");
  assert.match(missing[0].omissionReason, /libc/);
});

test("explicit musl selection and changed target configuration require those exact variants", () => {
  assert.throws(
    () => assertProductionGraphs(graph(variants), graph([variants[0]]), policy(["glibc", "musl"])),
    /fixture-musl@1\.0\.0/,
  );
  const p = policy();
  p.host.libc = "musl";
  assert.throws(
    () => assertProductionGraphs(graph(variants), graph([variants[0]]), p),
    /fixture-musl@1\.0\.0/,
  );
});

test("nonoptional dependencies cannot use an unsupported platform or name exemption", () => {
  const name = "@napi-rs/canvas-android-arm64";
  const p = policy();
  p.metadata.set(`${name}@1.0.0`, { os: ["android"], cpu: ["arm64"] });
  assert.throws(() => assertProductionGraphs(graph([name], false), graph([]), p), /canvas-android/);
});

test("a nonoptional path wins when the same dependency has an optional path", () => {
  const locked = [
    ...graph(["fixture-musl"]),
    ...graph(["fixture-musl"], false).map((x) => ({ ...x, name: "@knorvia/other" })),
  ];
  assert.throws(() => assertProductionGraphs(locked, graph([]), policy()), /fixture-musl/);
});

test("stale installed versions and absent selected files remain failures", () => {
  const installed = [
    {
      name: "@knorvia/fixture",
      optionalDependencies: { "fixture-gnu": node("fixture-gnu", "0.9.0") },
    },
  ];
  assert.throws(
    () => assertProductionGraphs(graph(["fixture-gnu"]), installed, policy()),
    /Stale: fixture-gnu@0.9.0/,
  );
  const required = assertProductionGraphs(graph(["fixture-gnu"]), graph(["fixture-gnu"]), policy());
  assert.throws(() => missingProductionPackages(required, new Map()), /Missing installed/);
});

test("unknown platform metadata and unknown Linux host libc cannot authorize omissions", () => {
  const p = policy();
  p.metadata.set("fixture-musl@1.0.0", { libc: "musl" });
  assert.throws(
    () => assertProductionGraphs(graph(variants), graph([variants[0]]), p),
    /platform|metadata/i,
  );
  const unknown = policy();
  delete unknown.host.libc;
  assert.throws(
    () => assertProductionGraphs(graph(variants), graph([variants[0]]), unknown),
    /libc/i,
  );
});

test("disabled optional installation still keeps nonoptional dependencies required", () => {
  const p = policy();
  p.includeOptional = false;
  const required = assertProductionGraphs(graph(["fixture-gnu"]), graph([]), p);
  assert.match(required.get("fixture-gnu@1.0.0").omissionReason, /optional/i);
  assert.throws(
    () => assertProductionGraphs(graph(["fixture-gnu"], false), graph([]), p),
    /Missing/,
  );
});

test("fixed lock metadata reads scoped versions and ignores nested peer maps", () => {
  const text =
    "lockfileVersion: '9.0'\npackages:\n  '@fixture/native@1.0.0':\n    cpu: [x64, arm64]\n    os: [linux]\n    libc: [glibc]\n    peerDependencies:\n      cpu: '*'\n  fixture@2.0.0:\n    resolution: {integrity: controlled}\nsnapshots:\n  fixture@2.0.0:\n";
  assert.deepEqual(
    [...readLockedPlatformMetadata(text)],
    [
      ["@fixture/native@1.0.0", { cpu: ["x64", "arm64"], os: ["linux"], libc: ["glibc"] }],
      ["fixture@2.0.0", {}],
    ],
  );
  for (const bad of [
    "packages:\n  fixture@1.0.0:\n    os: linux\n",
    "packages:\n  fixture@1.0.0:\n    os:\n      - linux\n",
    "packages:\n  fixture@1.0.0:\n    cpu: [x64]\n    cpu: [arm64]\n",
    "packages:\n  fixture@1.0.0:\n  fixture@1.0.0:\n",
  ])
    assert.throws(() => readLockedPlatformMetadata(bad), /metadata/);
});

test("optional install snapshots distinguish false from absent metadata", () => {
  assert.equal(readOptionalInstallSnapshot('{"included":{"optionalDependencies":true}}'), true);
  assert.equal(
    readOptionalInstallSnapshot(
      "included:\n  dependencies: true\n  optionalDependencies: false\nlayoutVersion: 5\n",
    ),
    false,
  );
  for (const text of [
    "{}",
    "included:\n  dependencies: true\n",
    '{"included":{"optionalDependencies":"false"}}',
  ])
    assert.throws(() => readOptionalInstallSnapshot(text), /Unknown/);
});

test("flattened pnpm dependency output recovers optional edges from all exact snapshot variants", () => {
  const text =
    "snapshots:\n  parent@1.0.0(peer@1.0.0):\n    dependencies:\n      required: 1.0.0\n    optionalDependencies:\n      fixture-musl: 1.0.0\n  parent@1.0.0(peer@2.0.0):\n    optionalDependencies:\n      fixture-musl: 1.0.0\n      required: 1.0.0\n";
  const edges = readLockedOptionalEdges(text);
  assert.equal(edges.get("parent@1.0.0").get("fixture-musl"), true);
  assert.equal(edges.get("parent@1.0.0").get("required"), false);
  const p = policy();
  p.optionalEdges = edges;
  p.metadata.set("parent@1.0.0", {});
  const locked = [
    {
      name: "@knorvia/fixture",
      dependencies: {
        parent: { ...node("parent"), dependencies: { "fixture-musl": node("fixture-musl") } },
      },
    },
  ];
  const installed = [{ name: "@knorvia/fixture", dependencies: { parent: node("parent") } }];
  assert.match(
    assertProductionGraphs(locked, installed, p).get("fixture-musl@1.0.0").omissionReason,
    /libc/,
  );
});
