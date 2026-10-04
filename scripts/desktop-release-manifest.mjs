// Release metadata and byte verification; immutable upload decisions remain in release-immutability.mjs.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const formats = {
  "win-x64-installed": ["-setup.exe", "-portable.zip"],
  "win-x64-portable": ["-portable.exe"],
  "linux-x64-installed": [".AppImage", ".deb", ".rpm", ".pkg.tar.zst"],
  "linux-x64-portable": ["-portable.AppImage", "-portable.tar.gz"],
};
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function artifactIdentity(path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Artifact is not a file: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { name: basename(path), bytes: info.size, sha256: hash.digest("hex") };
}

export function validatePlatformManifest(manifest, deliveredSha, version) {
  if (!/^[a-f0-9]{40}$/.test(deliveredSha) || manifest.deliveredSha !== deliveredSha)
    throw new Error("Release SHA must match the full checked source SHA");
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) || manifest.version !== version)
    throw new Error("Release version differs from the checked root version");
  const key = `${manifest.platform}-${manifest.variant}`;
  if (manifest.schemaVersion !== 1 || !Object.hasOwn(formats, key))
    throw new Error("Invalid release platform manifest");
  if (manifest.acceptance?.status !== "passed" || !manifest.acceptance.checks?.length)
    throw new Error("Actual package acceptance is required before release");
  if (
    manifest.acceptance.deliveredSha !== deliveredSha ||
    manifest.acceptance.version !== version ||
    manifest.acceptance.platform !== manifest.platform ||
    manifest.acceptance.variant !== manifest.variant
  )
    throw new Error("Package acceptance source/version/platform binding differs");
  const names = new Set();
  for (const asset of manifest.artifacts ?? []) {
    if (names.has(asset.name.toLowerCase())) throw new Error(`Duplicate asset: ${asset.name}`);
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.name) ||
      !asset.name.startsWith(`Knorvia-Studio-${version}-${manifest.platform}`) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0
    )
      throw new Error(`Invalid asset identity: ${asset.name}`);
    names.add(asset.name.toLowerCase());
  }
  for (const suffix of formats[key]) {
    if (!(manifest.artifacts ?? []).some((asset) => asset.name.endsWith(suffix)))
      throw new Error(`Required package format is missing: ${manifest.platform} ${suffix}`);
  }
  if (manifest.artifacts.length !== formats[key].length)
    throw new Error("Unexpected package formats in release manifest");
}

export async function aggregateRelease({ root, manifests, deliveredSha, version, legalFiles }) {
  const platforms = new Set(
    manifests.map((manifest) => `${manifest.platform}-${manifest.variant}`),
  );
  if (
    manifests.length !== 4 ||
    platforms.size !== 4 ||
    !Object.keys(formats).every((p) => platforms.has(p))
  )
    throw new Error("All checked platform/variant combinations are required exactly once");
  const packages = [];
  const names = new Set();
  for (const manifest of manifests) {
    if (manifest.acceptance?.diagnosticOnly)
      throw new Error("Diagnostic manifests cannot qualify a Release");
    validatePlatformManifest(manifest, deliveredSha, version);
    for (const asset of manifest.artifacts) {
      if (names.has(asset.name.toLowerCase())) throw new Error(`Duplicate asset: ${asset.name}`);
      names.add(asset.name.toLowerCase());
      const actual = await artifactIdentity(join(root, asset.name));
      if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.bytes)
        throw new Error(`Actual package bytes differ from accepted artifact: ${asset.name}`);
      packages.push({ ...actual, platform: manifest.platform, variant: manifest.variant });
    }
  }
  packages.sort((a, b) => a.name.localeCompare(b.name));
  const metadata = {
    schemaVersion: 1,
    version,
    tag: `v${version}`,
    deliveredSha,
    applicationLicense: "Apache-2.0",
    maintainer: "Knorvia Studio <accomplish07zrh@gmail.com>",
    packages,
    platforms: manifests.map(({ platform, variant, acceptance }) => ({
      platform,
      variant,
      acceptance,
    })),
    limits: [
      "Preview channel",
      "No real model-task or full legacy-user migration acceptance",
      "No macOS package in this release",
      "Package evidence does not establish full independent authorship",
    ],
  };
  await writeFile(join(root, "release-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  const assets = [...packages];
  for (const asset of packages) {
    const checksumName = `${asset.name}.sha256`;
    await writeFile(join(root, checksumName), `${asset.sha256}  ${asset.name}\n`, "ascii");
    assets.push(await artifactIdentity(join(root, checksumName)));
  }
  for (const { source, name } of legalFiles ?? []) {
    if (basename(name) !== name) throw new Error("Legal attachment must have a plain filename");
    await copyFile(source, join(root, name));
    assets.push(await artifactIdentity(join(root, name)));
  }
  assets.push(await artifactIdentity(join(root, "release-metadata.json")));
  assets.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    join(root, "SHA256SUMS"),
    assets.map((asset) => `${asset.sha256}  ${asset.name}\n`).join(""),
    "ascii",
  );
  assets.push(await artifactIdentity(join(root, "SHA256SUMS")));
  const artifacts = assets.map(({ name, sha256 }) => ({ name, sha256 }));
  await writeFile(join(root, "release-artifacts.json"), JSON.stringify(artifacts, null, 2) + "\n");
  return { metadata, artifacts };
}

async function main() {
  const [rootArg, deliveredSha] = process.argv.slice(2);
  const root = resolve(rootArg);
  const { version } = await json("package.json");
  const manifests = await Promise.all(
    Object.keys(formats).map((key) => json(join(root, `${key}-manifest.json`))),
  );
  const result = await aggregateRelease({
    root,
    manifests,
    deliveredSha,
    version,
    legalFiles: [
      { source: "LICENSE", name: "LICENSE-Apache-2.0.txt" },
      { source: "NOTICE.md", name: "NOTICE.md" },
      { source: "THIRD-PARTY-NOTICES.md", name: "THIRD-PARTY-NOTICES.md" },
      { source: "docs/desktop-release-installation.md", name: "INSTALLATION.md" },
    ],
  });
  console.log(
    JSON.stringify({
      version,
      deliveredSha,
      packages: result.metadata.packages.length,
      assets: result.artifacts.length,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
