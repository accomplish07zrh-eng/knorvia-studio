import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { aggregateRelease, validatePlatformManifest } from "./desktop-release-manifest.mjs";

const sha = "a".repeat(40);
const version = "0.8.0";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const formats = {
  "win-x64-installed": ["setup.exe", "portable.zip"],
  "win-x64-portable": ["portable.exe"],
  "linux-x64-installed": ["app.AppImage", "app.deb", "app.rpm", "app.pkg.tar.zst"],
  "linux-x64-portable": ["portable.AppImage", "portable.tar.gz"],
};
const fixture = (key) => {
  const variant = key.endsWith("-portable") ? "portable" : "installed";
  const platform = key.slice(0, -variant.length - 1);
  return {
    schemaVersion: 1,
    platform,
    variant,
    deliveredSha: sha,
    version,
    acceptance: {
      status: "passed",
      deliveredSha: sha,
      version,
      platform,
      variant,
      checks: ["fixture"],
      limits: ["Unit fixture, not product acceptance"],
    },
    artifacts: formats[key].map((format) => {
      const name = `Knorvia-Studio-${version}-${platform}-${format}`;
      return { name, sha256: digest(name), bytes: Buffer.byteLength(name) };
    }),
  };
};

test("release manifests require the exact full source SHA and version", () => {
  assert.doesNotThrow(() => validatePlatformManifest(fixture("win-x64-installed"), sha, version));
  assert.throws(
    () => validatePlatformManifest(fixture("win-x64-installed"), "b".repeat(40), version),
    /SHA/,
  );
  assert.throws(
    () => validatePlatformManifest(fixture("win-x64-installed"), sha, "0.8.0-preview.5"),
    /version/,
  );
  assert.throws(
    () => validatePlatformManifest(fixture("win-x64-installed"), sha.slice(0, 8), version),
    /SHA/,
  );
  const stale = fixture("win-x64-installed");
  stale.acceptance.deliveredSha = "b".repeat(40);
  assert.throws(() => validatePlatformManifest(stale, sha, version), /binding/);
});

test("missing formats, failed acceptance and duplicate asset names block release", () => {
  const missing = fixture("linux-x64-installed");
  missing.artifacts.pop();
  assert.throws(() => validatePlatformManifest(missing, sha, version), /format/);
  const failed = fixture("win-x64-installed");
  failed.acceptance.status = "failed";
  assert.throws(() => validatePlatformManifest(failed, sha, version), /acceptance/);
  const duplicate = fixture("win-x64-installed");
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
    assert.equal(result.metadata.packages.length, 9);
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

test("diagnostic manifests cannot enter release aggregation even with four variants", async () => {
  const manifests = Object.keys(formats).map(fixture);
  manifests[0].acceptance.diagnosticOnly = true;
  await assert.rejects(
    aggregateRelease({ root: "/unused", manifests, deliveredSha: sha, version, legalFiles: [] }),
    /Diagnostic/,
  );
});

test("stable aggregate binds root version, assets and metadata without preview labels", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-stable-release-"));
  try {
    const manifests = Object.keys(formats).map(fixture);
    for (const manifest of manifests)
      for (const asset of manifest.artifacts) await writeFile(join(root, asset.name), asset.name);
    const result = await aggregateRelease({
      root,
      manifests,
      deliveredSha: sha,
      version,
      legalFiles: [],
    });
    assert.equal(result.metadata.version, "0.8.0");
    assert.equal(result.metadata.tag, "v0.8.0");
    assert.equal(result.metadata.prerelease, false);
    assert.ok(result.metadata.limits.includes("Stable release"));
    assert.ok(!result.metadata.limits.some((text) => /preview|prerelease/i.test(text)));
    assert.ok(
      result.metadata.packages.every(
        (asset) => asset.name.includes("0.8.0-") && !asset.name.includes("preview"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
