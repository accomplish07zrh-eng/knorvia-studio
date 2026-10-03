import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getKnorviaDataRootDir } from "../paths.js";
import {
  createPluginSyncArchive,
  extractPluginSyncArchive,
  PLUGIN_SYNC_METADATA_ARCHIVE_PATH,
} from "./pluginSyncArchive.js";
import {
  pluginId,
  pluginRoot,
  record,
  required,
  safeDirectory,
  sha256,
  treeSize,
} from "./pluginSyncInventory.js";
import {
  dependencyClosure,
  loadMarketplace,
  mirrorManifest,
  prepareMirrors,
  readMarketplace,
} from "./pluginSyncMarketplace.js";
import { normalizePluginSyncRelativePath, resolvePluginSyncPathWithin } from "./pluginSyncPath.js";

function checkSize(size: number, max: number): void {
  if (size > max)
    throw new Error(`plugin marketplace source archive exceeds limit: ${size}/${max}`);
}

async function fingerprint(path: string): Promise<string> {
  const stat = await lstat(path);
  const hash = createHash("sha256");
  if (stat.isFile()) {
    hash.update("file\0");
    hash.update(await readFile(path));
  } else if (stat.isDirectory()) {
    hash.update("dir\0");
    const children = await readdir(path, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      hash.update(`${child.name}\0${await fingerprint(join(path, child.name))}\0`);
    }
  } else {
    throw new Error(`unsupported plugin archive source: ${path}`);
  }
  return hash.digest("hex");
}

export async function exportMarketplace(
  params: { marketplaceId: string; pluginNames: string[]; source: Record<string, unknown> },
  max: number,
) {
  const marketplaceId = pluginId(params.marketplaceId);
  const selected = [...new Set(params.pluginNames.map((name) => required(name, "plugin name")))];
  if (!selected.length) throw new Error("missing marketplace plugin names");
  const { manifest, sourceRoot } = await loadMarketplace(params.source);
  if (manifest.name !== marketplaceId) {
    throw new Error(`marketplace id mismatch: ${manifest.name} !== ${marketplaceId}`);
  }
  const closure = dependencyClosure(manifest, selected, marketplaceId);
  const mirrors = await prepareMirrors(manifest, closure, sourceRoot);
  const manifestContent = mirrorManifest(manifest, mirrors);
  const sizes = await Promise.all(
    mirrors.map(({ sourcePath }) => (sourcePath ? treeSize(sourcePath) : 0)),
  );
  checkSize(
    Buffer.byteLength(manifestContent, "utf8") + sizes.reduce((sum, size) => sum + size, 0),
    max,
  );
  const sourceFingerprints = await Promise.all(
    mirrors.map(({ sourcePath }) => (sourcePath ? fingerprint(sourcePath) : null)),
  );
  const directoryName = `${safeDirectory(marketplaceId)}-${sha256(JSON.stringify({ manifestContent, sourceFingerprints })).slice(0, 12)}`;
  const entries: Array<
    { content: string; archivePath: string } | { sourcePath: string; archivePath: string }
  > = [{ content: manifestContent, archivePath: `${directoryName}/marketplace.json` }];
  for (const mirror of mirrors) {
    if (mirror.sourcePath && mirror.relativeSource) {
      entries.push({
        sourcePath: mirror.sourcePath,
        archivePath: `${directoryName}/${mirror.relativeSource}`,
      });
    }
  }
  const archive = await createPluginSyncArchive({
    entries,
    metadata: { plugins: [], marketplaceSources: [{ marketplaceId, directoryName }] },
  });
  checkSize(archive.byteLength, max);
  return {
    archive,
    archiveBytes: archive.byteLength,
    marketplaceId,
    pluginNames: closure.map(({ name }) => name),
  };
}

export async function importMarketplace(
  params: { archive: Uint8Array; overwrite?: false },
  max: number,
) {
  if (params.overwrite) throw new Error("plugin marketplace source overwrite is not supported");
  checkSize(params.archive.byteLength, max);
  const temporary = join(
    getKnorviaDataRootDir(),
    "tmp",
    `plugin-marketplace-source-${randomUUID()}`,
  );
  try {
    await extractPluginSyncArchive(params.archive, temporary, { maxExtractedBytes: max });
    const metadata: unknown = JSON.parse(
      await readFile(join(temporary, PLUGIN_SYNC_METADATA_ARCHIVE_PATH), "utf8"),
    );
    if (!record(metadata) || !Array.isArray(metadata.marketplaceSources)) {
      throw new Error("invalid plugin marketplace source archive metadata");
    }
    if (metadata.marketplaceSources.length !== 1) {
      throw new Error("plugin marketplace source archive must contain one marketplace");
    }
    const entry: unknown = metadata.marketplaceSources[0];
    if (!record(entry)) throw new Error("invalid plugin marketplace source metadata");
    const marketplaceId = pluginId(required(entry.marketplaceId, "marketplace source id"));
    const directoryName = normalizePluginSyncRelativePath(
      required(entry.directoryName, "marketplace source directory"),
    );
    const normalizedDirectory = normalizePluginSyncRelativePath(directoryName);
    const extracted = resolvePluginSyncPathWithin(temporary, normalizedDirectory);
    const manifest = await readMarketplace(join(extracted, "marketplace.json"));
    if (manifest.name !== marketplaceId) {
      throw new Error(
        `marketplace source archive id mismatch: ${manifest.name} !== ${marketplaceId}`,
      );
    }
    const target = resolvePluginSyncPathWithin(
      join(pluginRoot(), "marketplace-sources"),
      normalizedDirectory,
    );
    if (existsSync(target)) return { marketplaceId, path: target, status: "skipped" as const };
    await mkdir(dirname(target), { recursive: true });
    await cp(extracted, target, { recursive: true, errorOnExist: true, force: false });
    return { marketplaceId, path: target, status: "synced" as const };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
