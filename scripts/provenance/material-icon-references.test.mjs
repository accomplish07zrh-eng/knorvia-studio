// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditThirdPartyInventory } from "./third-party-audit.mjs";
import { git } from "./git.mjs";
import { compareMaterialIconReferences } from "./material-icons.mjs";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const commit = "1".repeat(40);
const secondary = "2".repeat(40);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-multi-icon-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from("<svg>controlled historical folder</svg>");
  const license = Buffer.from("Controlled retained publisher MIT license");
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets/folder-fixture-open.svg"), bytes);
  await writeFile(join(root, "LICENSE.txt"), license);
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const primary = {
    commit,
    match: "all",
    license: "MIT",
    retainedLicense: "LICENSE.txt",
    licenseSha256: sha(license),
  };
  const extra = { ...primary, commit: secondary, match: "open-folders" };
  const component = {
    id: "Material Icon Theme",
    roots: ["assets"],
    referenceRevision: commit,
    file: primary.retainedLicense,
    sha256: primary.licenseSha256,
    referenceSources: [extra],
  };
  const item = {
    path: "assets/folder-fixture-open.svg",
    sha256: sha(bytes),
    normalizedSha256: sha(bytes),
    sourcePath: "icons/folder-fixture-open.svg",
    sourceBlob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),
    sourceCommit: secondary,
    license: "MIT",
    licenseSha256: sha(license),
  };
  const material = {
    schemaVersion: 2,
    commit,
    referenceSources: [primary, extra],
    matched: [item],
    unresolved: [],
    retainedLicense: "LICENSE.txt",
    licenseSha256: sha(license),
  };
  const registers = {
    copied: [component],
    overrides: [],
    embedded: [],
    native: { components: [] },
    material,
  };
  const manifest = {
    inputs: { "pnpm-lock.yaml": sha("lockfileVersion: '9.0'\n") },
    patches: [],
    copied: [component],
    exceptions: [],
    embedded: [],
    reviewRequired: [],
  };
  const assetIssues = async () =>
    (await auditThirdPartyInventory(root, manifest, registers)).issues.filter((x) =>
      /[Aa]sset|[Mm]aterial icon/.test(x),
    );
  return { root, material, item, component, assetIssues };
}

test("declared secondary source with exact content and license passes asset binding", async (t) => {
  assert.deepEqual(await (await fixture(t)).assetIssues(), []);
});

for (const [label, change] of [
  [
    "unknown source commit",
    (f) => {
      f.item.sourceCommit = "3".repeat(40);
    },
  ],
  [
    "missing source commit",
    (f) => {
      delete f.item.sourceCommit;
    },
  ],
  [
    "wrong source path",
    (f) => {
      f.item.sourcePath = "icons/unrelated.svg";
    },
  ],
  [
    "wrong source blob",
    (f) => {
      f.item.sourceBlob = "0".repeat(40);
    },
  ],
  [
    "wrong publisher license",
    (f) => {
      f.item.licenseSha256 = "0".repeat(64);
    },
  ],
  [
    "wrong normalized content",
    (f) => {
      f.item.normalizedSha256 = "0".repeat(64);
    },
  ],
  [
    "unreflected secondary declaration",
    (f) => {
      f.material.referenceSources.pop();
    },
  ],
  [
    "secondary match scope mismatch",
    (f) => {
      f.component.referenceSources[0].match = "agent";
      f.material.referenceSources[1].match = "agent";
    },
  ],
  [
    "legacy schema cannot conceal extra source declarations",
    (f) => {
      f.material.schemaVersion = 1;
    },
  ],
]) {
  test(`asset binding rejects ${label}`, async (t) => {
    const f = await fixture(t);
    change(f);
    assert.ok((await f.assetIssues()).length > 0);
  });
}

test("source reproduction uses exact historical objects and preserves unknown assets", async (t) => {
  const f = await fixture(t);
  const source = join(f.root, "publisher");
  await mkdir(join(source, "icons"), { recursive: true });
  await git(source, ["init", "-q"]);
  const license = Buffer.from("Controlled retained publisher MIT license");
  await writeFile(join(source, "LICENSE"), license);
  const saveCommit = async (message) => {
    await git(source, ["add", "."]);
    await git(source, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "-qm",
      message,
    ]);
    return (await git(source, ["rev-parse", "HEAD"])).toString().trim();
  };
  const primary = await saveCommit("Primary fixture");
  await writeFile(
    join(source, "icons/folder-fixture-open.svg"),
    "<svg>controlled historical folder</svg>",
  );
  const folders = await saveCommit("Folder source fixture");
  await writeFile(join(source, "icons/agent.svg"), "<svg>controlled agent</svg>");
  const agent = await saveCommit("Agent source fixture");
  for (const [name, bytes] of [
    ["agent.svg", "<svg>controlled agent</svg>"],
    ["unknown.svg", "<svg>unknown</svg>"],
  ])
    await writeFile(join(f.root, "assets", name), bytes);
  const component = {
    ...f.component,
    referenceRevision: primary,
    referenceSources: [
      { ...f.component.referenceSources[0], commit: folders },
      { ...f.component.referenceSources[0], commit: agent, match: "agent" },
    ],
    files: ["folder-fixture-open.svg", "agent.svg", "unknown.svg"].map((name) => ({
      file: `assets/${name}`,
    })),
  };
  const result = await compareMaterialIconReferences(f.root, source, component);
  assert.deepEqual(
    result.matched.map((x) => [x.path, x.sourceCommit]),
    [
      ["assets/agent.svg", agent],
      ["assets/folder-fixture-open.svg", folders],
    ],
  );
  assert.deepEqual(
    result.unresolved.map((x) => x.path),
    ["assets/unknown.svg"],
  );
  await writeFile(join(source, "LICENSE"), "Different source license");
  const changedLicense = await saveCommit("Changed license fixture");
  component.referenceSources[1].commit = changedLicense;
  await assert.rejects(
    compareMaterialIconReferences(f.root, source, component),
    /Retained license differs/,
  );
});
