import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { aggregateRelease, validatePlatformManifest } from "./desktop-release-manifest.mjs";

const sha = "a".repeat(40);
const version = "0.8.0-preview.4";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const formats = {
  "win-x64": ["setup.exe", "portable.zip"],
  "linux-x64": ["app.AppImage", "app.deb", "app.rpm", "app.pkg.tar.zst"],
};
const fixture = (platform) => ({
  schemaVersion: 1,
  platform,
  deliveredSha: sha,
  version,
  acceptance: {
    status: "passed",
    checks: ["fixture"],
    limits: ["Unit fixture, not product acceptance"],
  },
  artifacts: formats[platform].map((format) => {
    const name = `Knorvia-Studio-${version}-${platform}-${format}`;
    return { name, sha256: digest(name), bytes: Buffer.byteLength(name) };
  }),
});

test("release manifests require the exact full source SHA and version", () => {
  assert.doesNotThrow(() => validatePlatformManifest(fixture("win-x64"), sha, version));
  assert.throws(() => validatePlatformManifest(fixture("win-x64"), "b".repeat(40), version), /SHA/);
  assert.throws(
    () => validatePlatformManifest(fixture("win-x64"), sha, "0.8.0-preview.5"),
    /version/,
  );
  assert.throws(
    () => validatePlatformManifest(fixture("win-x64"), sha.slice(0, 8), version),
    /SHA/,
  );
});

test("missing formats, failed acceptance and duplicate asset names block release", () => {
  const missing = fixture("linux-x64");
  missing.artifacts.pop();
  assert.throws(() => validatePlatformManifest(missing, sha, version), /format/);
  const failed = fixture("win-x64");
  failed.acceptance.status = "failed";
  assert.throws(() => validatePlatformManifest(failed, sha, version), /acceptance/);
  const duplicate = fixture("win-x64");
  duplicate.artifacts.push(duplicate.artifacts[0]);
  assert.throws(() => validatePlatformManifest(duplicate, sha, version), /Duplicate/);
});

test("aggregation checks actual package bytes and emits checksums for both platforms", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-release-manifest-test-"));
  try {
    const manifests = Object.keys(formats).map(fixture);
    for (const manifest of manifests) {
      for (const asset of manifest.artifacts) await writeFile(join(root, asset.name), asset.name);
    }
    const result = await aggregateRelease({
      root,
      manifests,
      deliveredSha: sha,
      version,
      legalFiles: [],
    });
    assert.equal(result.metadata.deliveredSha, sha);
    assert.equal(result.metadata.packages.length, 6);
    const sums = await readFile(join(root, "SHA256SUMS"), "utf8");
    for (const manifest of manifests) {
      for (const asset of manifest.artifacts)
        assert.ok(sums.includes(`${asset.sha256}  ${asset.name}\n`));
    }
    assert.ok(result.artifacts.some((asset) => asset.name === "SHA256SUMS"));
    await writeFile(join(root, manifests[0].artifacts[0].name), "tampered package");
    await assert.rejects(
      aggregateRelease({ root, manifests, deliveredSha: sha, version, legalFiles: [] }),
      /bytes/,
    );
    await assert.rejects(
      aggregateRelease({
        root,
        manifests: [manifests[0]],
        deliveredSha: sha,
        version,
        legalFiles: [],
      }),
      /platform/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
