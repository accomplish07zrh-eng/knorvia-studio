// Internal partition of the same root-authored cache owner; no new rights claim.
import { type Dirent } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "@knorvia/server/remote/deployShared.js";
import { extractTarGzArchive } from "@knorvia/server/remote/localTarGz.js";
import { buildComponentArtifactUrlCandidates } from "@knorvia/server/remote/remoteAssetCdn.js";
import { resolveRemoteAssetFetch } from "@knorvia/server/remote/remoteAssetNetwork.js";
import type { RemoteAssetManifest } from "./remoteAssetCache.js";
import type { Component, Context } from "./remoteAssetCacheModel.js";
import {
  problem,
  usesRemoteAssetContentAddressedCacheIdentity,
  resolveRemoteAssetComponentCacheVersion,
  componentRoot,
} from "./remoteAssetCacheModel.js";
import {
  info,
  markedDirectory,
  fullRelease,
  contained,
  componentReadiness,
  markerAt,
  stageAt,
  commitDirectory,
  materialize,
  nonempty,
  digestFile,
  unpackedDigest,
  download,
} from "./remoteAssetCacheFiles.js";

async function artifactResponse(
  c: Context,
  component: Component,
  urls: string[],
): Promise<Response> {
  const fetch = resolveRemoteAssetFetch(c.options.remoteAssetNetwork),
    failures: string[] = [];
  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      failures.push(`${url} -> ${String(error)}`);
      continue;
    }
    if (!response.ok) {
      failures.push(`${url} -> HTTP ${response.status}`);
      continue;
    }
    c.loggers.log(`[remote-assets] downloading ${url}`);
    return response;
  }
  throw problem(`failed to fetch ${component.id}@${component.version}: ${failures.join("; ")}`);
}

async function migrateComponent(
  c: Context,
  component: Component,
  source: string,
  sourceLabel: string,
  target: string,
): Promise<void> {
  const stage = stageAt(
      c,
      `remote-component-migrate-${component.id}-${c.platform}-${component.version}`,
    ),
    content = path.join(stage, "component");
  try {
    await materialize(source, content);
    await nonempty(
      content,
      `migrated component source is empty for ${component.id}@${component.version}`,
    );
    await markerAt(content);
    await commitDirectory(content, target);
    c.loggers.log(
      `[remote-assets] migrated ${component.id}@${component.version} from ${sourceLabel}`,
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function migrateOldComponent(
  c: Context,
  component: Component,
  target: string,
): Promise<boolean> {
  const root = componentRoot(c, component),
    prefix = `${resolveRemoteAssetComponentCacheVersion(component.version)}+`;
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }
  let choice: { dir: string; name: string; time: number } | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (!name.startsWith(prefix)) continue;
    const dir = path.join(root, name);
    if (path.resolve(dir) === path.resolve(target) || !(await markedDirectory(dir))) continue;
    const time = (await stat(dir)).mtimeMs;
    if (choice === undefined || time > choice.time) choice = { dir, name, time };
  }
  if (!choice) return false;
  await migrateComponent(c, component, choice.dir, `legacy component cache ${choice.name}`, target);
  return true;
}

async function migrateOldRelease(
  c: Context,
  component: Component,
  target: string,
): Promise<boolean> {
  const plus = component.version.lastIndexOf("+"),
    suffix = component.version.slice(plus + 1);
  if (plus < 0 || !/^[a-f0-9]{12,64}$/iu.test(suffix)) return false;
  const releases = path.join(c.cache, "releases");
  let entries: Dirent[];
  try {
    entries = await readdir(releases, { withFileTypes: true });
  } catch {
    return false;
  }
  const versions = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  versions.sort((a, b) => b.localeCompare(a));
  for (const version of versions) {
    if (version === c.version || !(await info(path.join(releases, version)))?.isDirectory())
      continue;
    const release = path.join(releases, version, c.platform);
    if (!(await fullRelease(release, c.platform))) continue;
    const source = contained(release, component.mount, `legacy component ${component.id} mount`);
    if (!(await info(source))?.isDirectory()) continue;
    let digest: string;
    try {
      digest = await unpackedDigest(source);
    } catch (error) {
      c.loggers.logWarn(
        `[remote-assets] skip legacy component migration for ${component.id}@${component.version} from ${version}: ${String(error)}`,
      );
      continue;
    }
    if (!digest.startsWith(suffix.toLowerCase())) continue;
    await migrateComponent(c, component, source, `legacy release ${version}`, target);
    return true;
  }
  return false;
}

export async function componentOperation(
  c: Context,
  component: Component,
  bases: string[],
  target: string,
  required: string[],
): Promise<string> {
  if (c.options.forceRefresh)
    c.loggers.logWarn(
      `[remote-assets] forced component refresh: component=${component.id} path=${target}`,
    );
  else {
    const current = await componentReadiness(target, required);
    if (current.ready) return target;
    if (current.marked) {
      c.loggers.logWarn(
        `[remote-assets] local component cache incomplete: component=${component.id} missing=${current.missing.join(",")}; redownloading`,
      );
      await rm(target, { recursive: true, force: true });
    }
    if (!usesRemoteAssetContentAddressedCacheIdentity(component.id)) {
      for (const migrate of [migrateOldComponent, migrateOldRelease]) {
        if (!(await migrate(c, component, target))) continue;
        const migrated = await componentReadiness(target, required);
        if (migrated.ready) return target;
        c.loggers.logWarn(
          `[remote-assets] migrated local component cache incomplete: component=${component.id} missing=${migrated.missing.join(",")}; redownloading`,
        );
        await rm(target, { recursive: true, force: true });
      }
    }
  }
  const urls = buildComponentArtifactUrlCandidates(bases, component.artifactPath, c.version);
  await mkdir(path.join(c.cache, "staging"), { recursive: true });
  const stage = stageAt(c, `remote-component-${component.id}-${c.platform}-${component.version}`);
  const archive = path.join(stage, "component.tar.gz"),
    extracted = path.join(stage, "extract");
  await mkdir(extracted, { recursive: true });
  try {
    const response = await artifactResponse(c, component, urls);
    await download(response, archive, c.loggers);
    const digest = await digestFile(archive);
    if (digest !== component.sha256)
      throw problem(
        `sha256 mismatch for ${component.id}@${component.version}: expected=${component.sha256}, actual=${digest}`,
      );
    await extractTarGzArchive(archive, extracted);
    await nonempty(
      extracted,
      `extracted component archive is empty for ${component.id}@${component.version}`,
    );
    await markerAt(extracted);
    await commitDirectory(extracted, target);
    return target;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function mountComponent(
  c: Context,
  component: Component,
  source: string,
  release: string,
): Promise<void> {
  const target = contained(release, component.mount, `component ${component.id} mount`);
  const stage = stageAt(c, `remote-release-component-${component.id}-${c.platform}`),
    content = path.join(stage, "component");
  try {
    await materialize(source, content);
    await nonempty(content, `release component is empty for ${component.id}@${component.version}`);
    await commitDirectory(content, target);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function assemble(
  c: Context,
  manifest: RemoteAssetManifest,
  ids: string[] | undefined,
  parts: { component: Component; source: string }[],
  release: string,
): Promise<string> {
  await mkdir(release, { recursive: true });
  for (const part of parts) await mountComponent(c, part.component, part.source, release);
  await writeFile(
    path.join(release, `manifest-${c.platform}.json`),
    `${JSON.stringify(manifest)}\n`,
    "utf8",
  );
  if (!ids) {
    if (
      !(await info(release))?.isDirectory() ||
      !(await fileExists(release, "server", "knorvia-server.cjs")) ||
      !(await fileExists(release, "node", c.platform, "node"))
    )
      throw problem("assembled release directory is invalid");
    await markerAt(release);
  }
  return release;
}
