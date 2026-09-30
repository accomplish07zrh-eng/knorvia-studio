// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { readVerifiedNotices } from "../third-party-notices.mjs";
import { BASELINE_COMMIT, createIndexes, currentPath } from "./model.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const materialReason =
  "Original version-specific publisher copyright/license material remains incomplete.";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-notice-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path, value) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), value);
  };
  const registries = {
    "third-party/copied-components.json": [],
    "third-party/npm-overrides.json": [],
    "third-party/embedded-components.json": [],
    "third-party/native-search/sources.json": { components: [] },
    "licensing/evidence/material-icon-theme.json": {
      schemaVersion: 1,
      matched: [],
      unresolved: [],
    },
  };
  const bytes = "Original retained publisher license\n";
  const manifest = {
    schemaVersion: 1,
    noticesSha256: digest(bytes),
    inputs: {},
    copied: [],
    exceptions: [],
    embedded: [],
    reviewRequired: [],
  };
  const save = async () => {
    for (const [path, value] of Object.entries(registries)) {
      const data = `${JSON.stringify(value)}\n`;
      await put(path, data);
      manifest.inputs[path] = digest(data);
    }
    await put("THIRD-PARTY-NOTICES.md", bytes);
    await put("third-party/inventory.json", JSON.stringify(manifest));
  };
  await save();
  return { root, put, save, registries, manifest, bytes };
}

test("consistent empty material registers preserve the exact notice bytes", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await readVerifiedNotices(f.root), Buffer.from(f.bytes));
});

test("a manifest cannot hide an npm material exception behind an empty reviewRequired", async (t) => {
  const f = await fixture(t);
  const record = {
    package: "publisher-fixture@1.0.0",
    source: "https://example.invalid/package",
    evidenceKind: "publisher-license-identifier-and-standard-terms",
  };
  f.registries["third-party/npm-overrides.json"].push(record);
  f.manifest.exceptions.push(record);
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /publisher-fixture@1\.0\.0/);
});

test("deleting an exception projection while keeping the source register is rejected", async (t) => {
  const f = await fixture(t);
  f.registries["third-party/npm-overrides.json"].push({
    package: "removed-fixture@2",
    evidenceKind: "metadata-only",
    source: "https://example.invalid/source",
  });
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /exception.*projection|projection.*exception/i);
});

test("an accurately recorded exception passes freshness but fails completeness", async (t) => {
  const f = await fixture(t);
  const record = {
    package: "historical-fixture@1",
    evidenceKind: "metadata-only",
    source: "https://example.invalid/source",
  };
  f.registries["third-party/npm-overrides.json"].push(record);
  f.manifest.exceptions.push(record);
  f.manifest.reviewRequired.push({ id: record.package, reason: materialReason });
  await f.save();
  assert.deepEqual(await readVerifiedNotices(f.root), Buffer.from(f.bytes));
  await assert.rejects(
    readVerifiedNotices(f.root, { requireComplete: true }),
    /historical-fixture@1/,
  );
});

test("copied and embedded missing evidence is re-derived rather than trusted from the manifest", async (t) => {
  const f = await fixture(t);
  const copied = { id: "copied-fixture", roots: [], reviewRequired: "No original notice" };
  const embedded = { id: "embedded-fixture", reviewRequired: "No link provenance" };
  f.registries["third-party/copied-components.json"].push(copied);
  f.registries["third-party/embedded-components.json"].push(embedded);
  f.manifest.copied.push(copied);
  f.manifest.embedded.push(embedded);
  await f.save();
  await assert.rejects(
    readVerifiedNotices(f.root),
    (e) => /copied-fixture/.test(e.message) && /embedded-fixture/.test(e.message),
  );
});

test("an unrecorded native component without a notice cannot pass completeness", async (t) => {
  const f = await fixture(t);
  f.registries["third-party/native-search/sources.json"].components.push({
    id: "native-fixture",
    version: "abc",
    notices: [],
  });
  await f.save();
  await assert.rejects(
    readVerifiedNotices(f.root, { requireComplete: true }),
    /native-fixture@abc/,
  );
});

test("all stale inputs are reported together, including changes after a missing input", async (t) => {
  const f = await fixture(t);
  f.manifest.inputs = { "missing-first.txt": digest("old"), "changed-second.txt": digest("old") };
  await f.put("changed-second.txt", "new");
  await f.save();
  await assert.rejects(
    readVerifiedNotices(f.root),
    (e) => /missing-first.txt/.test(e.message) && /changed-second.txt/.test(e.message),
  );
});

test("UTF-8 CRLF checkout differences are allowed", async (t) => {
  const f = await fixture(t);
  await f.put("text.txt", "publisher\r\nnotice\r\n");
  f.manifest.inputs["text.txt"] = digest("publisher\nnotice\n");
  await f.save();
  await readVerifiedNotices(f.root);
});

test("distinct invalid UTF-8 input bytes cannot collapse to the same replacement character", async (t) => {
  const f = await fixture(t);
  await f.put("binary.dat", Buffer.from([255]));
  f.manifest.inputs["binary.dat"] = digest(Buffer.from([254]).toString("utf8"));
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /binary.dat/);
});

test("all source registers must stay bound to the inventory inputs", async (t) => {
  const f = await fixture(t);
  delete f.manifest.inputs["third-party/npm-overrides.json"];
  await f.put("third-party/inventory.json", JSON.stringify(f.manifest));
  await assert.rejects(
    readVerifiedNotices(f.root),
    /source register input missing.*npm-overrides/i,
  );
});

test("refreshing the outer registry hash cannot hide a stale native configuration input", async (t) => {
  const f = await fixture(t);
  f.registries["third-party/native-search/sources.json"].inputs = {
    "native-config.mjs": digest("old"),
  };
  await f.put("native-config.mjs", "new");
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /native input changed.*native-config/i);
});

async function assetFixture(t) {
  const f = await fixture(t);
  const license = "Retained asset publisher license\n";
  await f.put("asset-license.txt", license);
  await f.put("assets/pending.svg", "<svg>pending</svg>");
  const component = {
    id: "Material Icon Theme",
    roots: ["assets"],
    file: "asset-license.txt",
    sha256: digest(license),
  };
  f.registries["third-party/copied-components.json"].push(component);
  f.manifest.copied.push(component);
  Object.assign(f.registries["licensing/evidence/material-icon-theme.json"], {
    retainedLicense: component.file,
    licenseSha256: component.sha256,
    unresolved: [
      {
        path: "assets/pending.svg",
        reason: "source-path-not-found",
        sha256: digest("<svg>pending</svg>"),
        normalizedSha256: digest("<svg>pending</svg>"),
      },
    ],
  });
  f.manifest.reviewRequired.push({
    id: "assets/pending.svg",
    reason: "Material Icon Theme source unresolved: source-path-not-found",
  });
  await f.save();
  return f;
}

test("an unresolved icon remains a strict blocker even after the evidence digest is refreshed", async (t) => {
  const f = await assetFixture(t);
  await readVerifiedNotices(f.root);
  await assert.rejects(
    readVerifiedNotices(f.root, { requireComplete: true }),
    /assets\/pending.svg/,
  );
});

test("deleting an unresolved icon from evidence fails directory coverage", async (t) => {
  const f = await assetFixture(t);
  f.registries["licensing/evidence/material-icon-theme.json"].unresolved = [];
  f.manifest.reviewRequired = [];
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /coverage.*assets\/pending.svg/i);
});

test("unresolved evidence without a current content digest is rejected", async (t) => {
  const f = await assetFixture(t);
  delete f.registries["licensing/evidence/material-icon-theme.json"].unresolved[0].sha256;
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /digest.*assets\/pending.svg/i);
});

test("a changed unresolved icon is not hidden by an unchanged reason", async (t) => {
  const f = await assetFixture(t);
  await f.put("assets/pending.svg", "<svg>different</svg>");
  await assert.rejects(readVerifiedNotices(f.root), /changed.*assets\/pending.svg/i);
});

test("duplicate matched and unresolved paths are rejected", async (t) => {
  const f = await assetFixture(t);
  f.registries["licensing/evidence/material-icon-theme.json"].matched.push({
    ...f.registries["licensing/evidence/material-icon-theme.json"].unresolved[0],
  });
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /duplicate.*assets\/pending.svg/i);
});

test("changing an already matched asset invalidates its publisher comparison", async (t) => {
  const f = await assetFixture(t);
  const evidence = f.registries["licensing/evidence/material-icon-theme.json"];
  evidence.matched = evidence.unresolved;
  evidence.unresolved = [];
  f.manifest.reviewRequired = [];
  await f.save();
  await f.put("assets/pending.svg", "<svg>changed</svg>");
  await assert.rejects(readVerifiedNotices(f.root), /changed.*assets\/pending.svg/i);
});

test("a new asset requires new source evidence even when all existing records are valid", async (t) => {
  const f = await assetFixture(t);
  await f.put("assets/new.svg", "<svg>new</svg>");
  await assert.rejects(readVerifiedNotices(f.root), /coverage.*assets\/new.svg/i);
});

test("an asset record outside the declared roots cannot pad evidence coverage", async (t) => {
  const f = await assetFixture(t);
  const extra = { path: "other.svg", reason: "source-path-not-found", sha256: digest("x") };
  f.registries["licensing/evidence/material-icon-theme.json"].unresolved.push(extra);
  f.manifest.reviewRequired.push({
    id: extra.path,
    reason: "Material Icon Theme source unresolved: source-path-not-found",
  });
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /outside its scope.*other.svg/i);
});

test("changing only the asset comparison pin contradicts the copied source declaration", async (t) => {
  const f = await assetFixture(t);
  f.registries["third-party/copied-components.json"][0].referenceRevision = "publisher-pin";
  f.registries["licensing/evidence/material-icon-theme.json"].commit = "unrelated-pin";
  await f.save();
  await assert.rejects(readVerifiedNotices(f.root), /asset.*reference|reference.*asset/i);
});

test("the retained icon license cannot be changed while the asset evidence stays fixed", async (t) => {
  const f = await assetFixture(t);
  await f.put("asset-license.txt", "Unrelated license\n");
  await assert.rejects(readVerifiedNotices(f.root), /asset.*license|license.*asset/i);
});

test("only specifically evidenced legacy path aliases are reconciled", () => {
  for (const [oldPath, newPath] of [
    ["packages/zcode-cua/package.json", "packages/cua/package.json"],
    ["packages/zcode-server-cli/package.json", "packages/server-cli/package.json"],
    [
      "packages/shared/src/zcode-protocol-v4/wire-codec.ts",
      "packages/shared/src/protocol-v4/wire-codec.ts",
    ],
    [
      "packages/ui/src/components/ui/ZCodeAboutLogo.tsx",
      "packages/ui/src/components/ui/AboutLogo.tsx",
    ],
  ])
    assert.equal(currentPath(oldPath), newPath);
  assert.equal(currentPath("packages/zcode-cua/unknown.ts"), "packages/zcode-cua/unknown.ts");
});

test("a verified rename still rejects a conflicting baseline destination", () => {
  const baseline = {
    schemaVersion: 1,
    commit: BASELINE_COMMIT,
    files: [
      { path: "packages/zcode-cua/package.json", normalizedSha256: digest("old") },
      { path: "packages/cua/package.json", normalizedSha256: digest("new") },
    ],
  };
  assert.throws(
    () => createIndexes(baseline, { schemaVersion: 1, files: [] }, {}),
    /duplicate baseline/i,
  );
});
