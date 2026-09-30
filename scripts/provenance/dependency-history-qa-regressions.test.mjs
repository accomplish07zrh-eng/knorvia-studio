// Regression contract: current dependency coverage cannot be replaced by history.
// Historical claims require exact version, owner, source and retained notice bytes.
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
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
  const block = `### Notice ${oldHash}\n\n- old-dev@1.0.0: https://example.invalid/version/1.0.0\n- current@1.0.0: LICENSE\n\n\`\`\`\`text\n${original.toString()}\n\`\`\`\`\n`;
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
      notices: [{ ...notice, member: name === "old-dev" ? override.source : notice.member }],
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
  // The original fixture is the reviewed commit; later edits are untrusted working-tree claims.
  await exec("git", ["init", "-q"], { cwd: root });
  await exec("git", ["-c", "core.autocrlf=false", "add", "."], { cwd: root });
  await exec(
    "git",
    [
      "-c",
      "user.name=Knorvia QA fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-q",
      "-m",
      "Reviewed fixture history",
    ],
    { cwd: root },
  );
  return { root, put, inventory, original, oldHash };
}

async function addForgedOverride(
  f,
  packageRecord,
  source = "https://example.invalid/version/1.0.0",
) {
  const record = {
    ...f.inventory.exceptions[0],
    package: `${packageRecord.name}@${packageRecord.version}`,
    source,
  };
  f.inventory.packages.push(packageRecord);
  f.inventory.exceptions = [record];
  f.inventory.reviewRequired[0].id = record.package;
  const text = JSON.stringify([record]);
  f.inventory.inputs["third-party/npm-overrides.json"] = sha(text);
  await f.put("third-party/npm-overrides.json", text);
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
}
for (const variant of ["empty", "borrowed-owner", "different-version", "different-member"]) {
  test(`historical claim rejects ${variant} before writing a preview`, async (t) => {
    const f = await fixture(t);
    const record = {
      name: variant === "different-version" ? "old-dev" : "forged-history",
      version: variant === "different-version" ? "1.0.1" : "9.9.9",
      license: "MIT",
      notices:
        variant === "empty"
          ? []
          : [
              {
                member:
                  variant === "different-member"
                    ? "https://example.invalid/other"
                    : "https://example.invalid/version/1.0.0",
                sha256: f.oldHash,
              },
            ],
    };
    await addForgedOverride(f, record);
    const preview = join(f.root, "preview");
    await assert.rejects(
      generateThirdPartyNotices(f.root, { outputDirectory: preview }),
      /historical|retained|source|owner|notice/i,
    );
    await assert.rejects(readFile(join(preview, "THIRD-PARTY-NOTICES.md")), { code: "ENOENT" });
    assert.ok((await readFile(join(f.root, "THIRD-PARTY-NOTICES.md"))).includes(f.original));
  });
}
test("historical override cannot substitute a different source URL for the original notice", async (t) => {
  const f = await fixture(t);
  f.inventory.exceptions[0].source = "https://example.invalid/forged-source";
  const text = JSON.stringify(f.inventory.exceptions);
  f.inventory.inputs["third-party/npm-overrides.json"] = sha(text);
  await f.put("third-party/npm-overrides.json", text);
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
  await assert.rejects(
    generateThirdPartyNotices(f.root, { outputDirectory: join(f.root, "preview") }),
    /historical|retained|source|notice/i,
  );
});
test("verified historical and current notices keep exact bytes, references and open obligations", async (t) => {
  const f = await fixture(t);
  const preview = join(f.root, "preview");
  await generateThirdPartyNotices(f.root, { outputDirectory: preview });
  const inventory = JSON.parse(await readFile(join(preview, "third-party/inventory.json")));
  const text = await readFile(join(preview, "THIRD-PARTY-NOTICES.md"));
  assert.equal(
    inventory.packages.find((p) => p.name === "old-dev").coverage,
    "retained-prior-declaration",
  );
  assert.ok(text.includes(f.original));
  assert.ok(text.includes(Buffer.from("- old-dev@1.0.0: https://example.invalid/version/1.0.0")));
  assert.deepEqual(inventory.exceptions, f.inventory.exceptions);
  assert.deepEqual(inventory.reviewRequired, f.inventory.reviewRequired);
  assert.deepEqual(inventory.currentProduction, ["current@1.0.0"]);
});

test("forged owner references plus a refreshed document digest do not create trusted history", async (t) => {
  const f = await fixture(t);
  const source = "https://example.invalid/version/1.0.0";
  await addForgedOverride(f, {
    name: "forged-history",
    version: "9.9.9",
    license: "MIT",
    notices: [{ member: source, sha256: f.oldHash }],
  });
  const text = (await readFile(join(f.root, "THIRD-PARTY-NOTICES.md"), "utf8")).replace(
    "\n\n````text",
    `\n- forged-history@9.9.9: ${source}\n\n\`\`\`\`text`,
  );
  f.inventory.noticesSha256 = sha(Buffer.from(text));
  await f.put("THIRD-PARTY-NOTICES.md", text);
  await f.put("third-party/inventory.json", JSON.stringify(f.inventory));
  await assert.rejects(
    generateThirdPartyNotices(f.root, { outputDirectory: join(f.root, "preview") }),
    /historical|trusted|source|notice/i,
  );
});
