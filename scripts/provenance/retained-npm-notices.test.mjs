// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { BASELINE_COMMIT, fingerprint } from "./model.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const collectors = new Map();
mock.module(new URL("../third-party-npm.mjs", import.meta.url).href, {
  namedExports: {
    hashBytes: sha,
    collectNpmNotices: async (root) => collectors.get(root)(),
  },
});
const { generateThirdPartyNotices } = await import("../generate-third-party-notices.mjs");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "knorvia-retained-npm-"));
  t.after(() => {
    collectors.delete(root);
    return rm(root, { recursive: true, force: true });
  });
  const put = async (path, data) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), data);
  };
  const original = Buffer.from("Controlled publisher copyright\r\nPermission fixture\n");
  const oldHash = sha(original);
  const block = `### Notice ${oldHash}\n\n- old-dev@1.0.0: original publisher URL\n- current@1.0.0: LICENSE\n\n\`\`\`\`text\n${original.toString()}\n\`\`\`\`\n`;
  const notices = Buffer.from(`# Controlled fixture notices\n\n${block}`);
  const override = {
    package: "old-dev@1.0.0",
    file: `third-party/upstream/${oldHash}.txt`,
    sha256: oldHash,
    source: "https://example.invalid/version/1.0.0",
    evidenceKind: "publisher-license-identifier-and-standard-terms",
  };
  const registries = {
    "third-party/copied-components.json": [],
    "third-party/npm-overrides.json": [override],
    "third-party/embedded-components.json": [],
    "third-party/native-search/sources.json": {
      inputs: {},
      components: [],
      archives: [],
      scope: "Controlled native fixture",
    },
    "licensing/evidence/material-icon-theme.json": {
      schemaVersion: 1,
      matched: [],
      unresolved: [],
    },
    "third-party/runtime/sources.json": { node: [] },
  };
  const inputs = { "pnpm-lock.yaml": sha("lockfileVersion: '9.0'\n") };
  for (const [path, data] of Object.entries(registries)) {
    const bytes = JSON.stringify(data);
    await put(path, bytes);
    inputs[path] = sha(bytes);
  }
  await put("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  await put("pnpm-workspace.yaml", "packages: []\n");
  await put("package.json", '{"name":"@knorvia/fixture"}');
  await put("scripts/license-texts/Apache-2.0.txt", "Controlled license fixture");
  await put(override.file, original);
  await put("THIRD-PARTY-NOTICES.md", notices);
  const notice = { member: "LICENSE", sha256: oldHash };
  const inventory = {
    schemaVersion: 1,
    noticesSha256: sha(notices),
    inputs,
    copied: [],
    embedded: [],
    patches: [],
    exceptions: [override],
    packages: ["current", "old-dev"].map((name) => ({
      name,
      version: "1.0.0",
      license: "MIT",
      notices: [notice],
    })),
    notInstalled: [],
    reviewRequired: [
      {
        id: override.package,
        reason:
          "Original version-specific publisher copyright/license material remains incomplete.",
      },
    ],
  };
  await put("third-party/inventory.json", JSON.stringify(inventory));
  collectors.set(root, async () => ({
    packages: [
      {
        name: "current",
        version: "1.0.0",
        license: "MIT",
        notices: [{ member: "NEW-NOTICE", bytes: Buffer.from("Controlled current supplement\n") }],
      },
    ],
    notInstalled: [],
    workspaceManifests: [],
  }));
  return { root, put, inventory, original, oldHash };
}

test("regeneration retains development/historical records, original origins and exact publisher notice bytes", async (t) => {
  const f = await fixture(t);
  await generateThirdPartyNotices(f.root);
  const inventory = JSON.parse(await readFile(join(f.root, "third-party/inventory.json")));
  assert.equal(inventory.packages.length, 2);
  assert.equal(
    inventory.packages.find((x) => x.name === "old-dev").coverage,
    "retained-prior-declaration",
  );
  assert.ok(
    inventory.packages
      .find((x) => x.name === "current")
      .notices.some((x) => x.sha256 === f.oldHash),
  );
  assert.deepEqual(inventory.exceptions, f.inventory.exceptions);
  assert.deepEqual(inventory.reviewRequired, f.inventory.reviewRequired);
  const text = await readFile(join(f.root, "THIRD-PARTY-NOTICES.md"));
  assert.ok(text.includes(f.original));
  assert.ok(text.includes(Buffer.from("- old-dev@1.0.0: original publisher URL")));
});

test("a changed previously verified document is rejected before collection or any write", async (t) => {
  const f = await fixture(t);
  let called = false;
  collectors.set(f.root, async () => {
    called = true;
    throw Error("collection unexpectedly reached");
  });
  await f.put("THIRD-PARTY-NOTICES.md", "tampered");
  await assert.rejects(generateThirdPartyNotices(f.root), /notices changed/i);
  assert.equal(called, false);
  assert.equal(await readFile(join(f.root, "THIRD-PARTY-NOTICES.md"), "utf8"), "tampered");
});

test("historical claims cannot conceal a missing current dependency", async (t) => {
  const f = await fixture(t);
  collectors.set(f.root, async () => {
    throw Error("Missing installed dependency: current@1.0.0");
  });
  await assert.rejects(generateThirdPartyNotices(f.root), /Missing installed dependency/);
  assert.deepEqual(
    JSON.parse(await readFile(join(f.root, "third-party/inventory.json"))),
    f.inventory,
  );
});

test("refreshing a document hash cannot conceal changed original publisher text", async (t) => {
  const f = await fixture(t);
  const path = join(f.root, "THIRD-PARTY-NOTICES.md");
  const tampered = Buffer.from(
    (await readFile(path, "utf8")).replace("Permission fixture", "Changed fixture"),
  );
  f.inventory.noticesSha256 = sha(tampered);
  await f.put("THIRD-PARTY-NOTICES.md", tampered);
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
  await assert.rejects(generateThirdPartyNotices(f.root), /Retained notice digest mismatch/);
  assert.deepEqual(await readFile(path), tampered);
});

test("changed historical supplement bytes fail without rewriting", async (t) => {
  const f = await fixture(t);
  await f.put(f.inventory.exceptions[0].file, "Changed original supplement");
  await assert.rejects(generateThirdPartyNotices(f.root), /Changed retained upstream notice/);
  assert.deepEqual(
    JSON.parse(await readFile(join(f.root, "third-party/inventory.json"))),
    f.inventory,
  );
});

test("an override outside the graph must have a prior exact-version source record", async (t) => {
  const f = await fixture(t);
  f.inventory.exceptions[0].package = "unrecorded@1.0.0";
  f.inventory.reviewRequired[0].id = "unrecorded@1.0.0";
  const overrides = JSON.stringify(f.inventory.exceptions);
  f.inventory.inputs["third-party/npm-overrides.json"] = sha(overrides);
  await f.put("third-party/npm-overrides.json", overrides);
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
  await assert.rejects(generateThirdPartyNotices(f.root), /no current or retained source record/);
});

test("preview outputs are complete while the retained document and manifest remain byte-identical", async (t) => {
  const f = await fixture(t);
  const before = await readFile(join(f.root, "THIRD-PARTY-NOTICES.md"));
  const preview = join(f.root, "preview");
  await generateThirdPartyNotices(f.root, { outputDirectory: preview });
  assert.deepEqual(await readFile(join(f.root, "THIRD-PARTY-NOTICES.md")), before);
  assert.deepEqual(
    JSON.parse(await readFile(join(f.root, "third-party/inventory.json"))),
    f.inventory,
  );
  assert.equal(
    JSON.parse(await readFile(join(preview, "third-party/inventory.json"))).packages.length,
    2,
  );
});

test("inherited modification attribution is accepted only for byte-bound unchanged baseline files", async (t) => {
  const f = await fixture(t);
  const path = "copied/fixture.ts";
  const bytes = Buffer.from(
    "// Modified by ZCode: controlled fixture integration.\nexport const fixture = 1;\n",
  );
  await f.put(path, bytes);
  await f.put(
    "licensing/upstream-baseline.json",
    JSON.stringify({
      schemaVersion: 1,
      commit: BASELINE_COMMIT,
      files: [{ path, normalizedSha256: fingerprint(bytes).normalizedSha256 }],
    }),
  );
  const copied = [
    {
      id: "Controlled copied fixture",
      roots: ["copied"],
      modifiedFiles: [path],
      file: f.inventory.exceptions[0].file,
      sha256: f.oldHash,
      source: "https://example.invalid/copied",
      license: "Apache-2.0",
    },
  ];
  const register = JSON.stringify(copied);
  await f.put("third-party/copied-components.json", register);
  f.inventory.inputs["third-party/copied-components.json"] = sha(register);
  f.inventory.copied = [{ ...copied[0], files: [{ file: path, sha256: sha(bytes) }] }];
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
  await generateThirdPartyNotices(f.root, { outputDirectory: join(f.root, "preview") });
  await f.put(path, `${bytes.toString()}// controlled new change\n`);
  await assert.rejects(
    generateThirdPartyNotices(f.root, { outputDirectory: join(f.root, "preview") }),
    /Missing file-local modification/,
  );
});
