// Internal partition of the same root-authored cache owner; no new rights claim.
import { type RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";
import path from "node:path";
import { normalizeRemoteAssetRelativePath } from "@knorvia/server/remote/remoteAssetCdn.js";
import type { Component, Loggers, Context } from "./remoteAssetCacheModel.js";
import {
  problem,
  requestedIds,
  context,
  selectRemoteAssetManifestComponents,
  timeoutIdentity,
  manifestIdentity,
  requestManifest,
  componentDirectory,
  contentSegments,
  releaseBase,
  releaseDirectory,
  ordinarySelection,
} from "./remoteAssetCacheModel.js";
import { info, absentPaths, componentReadiness, releaseReady } from "./remoteAssetCacheFiles.js";
import { componentOperation, assemble } from "./remoteAssetCacheComponents.js";

export interface RemoteAssetManifest {
  schemaVersion: number;
  appVersion: string;
  platformArch: string;
  components: RemoteAssetManifestComponent[];
}

export interface RemoteAssetManifestComponent {
  id: string;
  version: string;
  sha256: string;
  artifactPath: string;
  mount: string;
}

export interface RemoteAssetManifestRef {
  manifest: RemoteAssetManifest;
  releaseBaseCandidatesForComponents: string[];
}

export interface RemoteAssetCacheLoggers {
  log: (...args: unknown[]) => void;
  logWarn: (...args: unknown[]) => void;
}

export interface EnsureRemoteReleaseDirOptions {
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  version: string;
  platformArch: string;
  componentIds?: string[];
  requiredReleasePaths?: string[];
  manifestRef?: RemoteAssetManifestRef | null;
  refreshManifest?: boolean;
  forceRefresh?: boolean;
  manifestRequestTimeoutMs?: number;
  remoteAssetNetwork?: RemoteAssetNetworkPort;
}

const manifestTasks = new Map<string, Promise<RemoteAssetManifestRef | null>>();

const refreshTasks = new Map<string, Promise<RemoteAssetManifestRef | null>>();

const componentTasks = new Map<string, Promise<string>>();

const releaseTasks = new Map<string, Promise<string>>();

const releaseQueues = new Map<string, Promise<string>>();

function startManifest(
  c: Context,
  key: string,
  refresh: boolean,
): Promise<RemoteAssetManifestRef | null> {
  let task!: Promise<RemoteAssetManifestRef | null>;
  task = (async () => {
    try {
      const result = await requestManifest(c);
      if (result === null && manifestTasks.get(key) === task) manifestTasks.delete(key);
      return result;
    } catch (error) {
      if (manifestTasks.get(key) === task) manifestTasks.delete(key);
      throw error;
    } finally {
      if (refresh && refreshTasks.get(key) === task) refreshTasks.delete(key);
    }
  })();
  manifestTasks.set(key, task);
  if (refresh) refreshTasks.set(key, task);
  return task;
}

async function manifestFor(
  c: Context,
  decide?: (ref: RemoteAssetManifestRef) => Promise<boolean>,
): Promise<RemoteAssetManifestRef | null> {
  const key = manifestIdentity(c),
    active = refreshTasks.get(key);
  if (active) return active;
  const cached = manifestTasks.get(key);
  if (!cached) {
    const result = await startManifest(
      c,
      key,
      Boolean(c.options.refreshManifest) || decide !== undefined,
    );
    return refreshTasks.get(key) ?? result;
  }
  const retained = await cached;
  if (refreshTasks.has(key)) return refreshTasks.get(key)!;
  const wantsRefresh =
    retained !== null &&
    (c.options.refreshManifest
      ? await Promise.resolve(true)
      : decide !== undefined && (await decide(retained)));
  if (refreshTasks.has(key)) return refreshTasks.get(key)!;
  return wantsRefresh ? startManifest(c, key, true) : retained;
}

export async function fetchRemoteAssetManifestRefFromCdn(
  options: EnsureRemoteReleaseDirOptions,
  loggers: Loggers,
): Promise<RemoteAssetManifestRef | null> {
  const c = context(options, loggers);
  return c ? manifestFor(c) : null;
}

export async function fetchRemoteAssetManifestFromCdn(
  options: EnsureRemoteReleaseDirOptions,
  loggers: Loggers,
): Promise<RemoteAssetManifest | null> {
  return (await fetchRemoteAssetManifestRefFromCdn(options, loggers))?.manifest ?? null;
}

async function ensureComponent(
  c: Context,
  component: Component,
  bases: string[],
  required: string[],
): Promise<string> {
  const target = componentDirectory(c, component),
    key = path.resolve(target);
  while (true) {
    const active = componentTasks.get(key);
    if (active) {
      const shared = await active,
        ready = await componentReadiness(shared, required);
      if (ready.ready) return shared;
      c.loggers.logWarn(
        `[remote-assets] locked component cache still incomplete: component=${component.id} missing=${ready.missing.join(",")}; redownloading`,
      );
      continue;
    }
    if (!c.options.forceRefresh) {
      const ready = await componentReadiness(target, required);
      if (componentTasks.has(key)) continue;
      if (ready.ready) return target;
    }
    let task!: Promise<string>;
    task = (async () => {
      try {
        return await componentOperation(c, component, bases, target, required);
      } finally {
        if (componentTasks.get(key) === task) componentTasks.delete(key);
      }
    })();
    componentTasks.set(key, task);
    return task;
  }
}

async function inReleaseOrder(key: string, action: () => Promise<string>): Promise<string> {
  const before = releaseQueues.get(key);
  const task = (before ? before.catch(() => undefined) : Promise.resolve()).then(action);
  releaseQueues.set(key, task);
  try {
    return await task;
  } finally {
    if (releaseQueues.get(key) === task) releaseQueues.delete(key);
  }
}

async function releaseOperation(
  c: Context,
  ids: string[] | undefined,
  required: string[],
): Promise<string> {
  const base = releaseBase(c);
  if (!c.options.forceRefresh && ordinarySelection(ids) && (await releaseReady(base, c, required)))
    return base;
  let ref: RemoteAssetManifestRef | null;
  if (c.options.manifestRef !== undefined) ref = c.options.manifestRef;
  else {
    const fetchContext = { ...c, options: { ...c.options, refreshManifest: false } };
    ref = await manifestFor(
      fetchContext,
      ordinarySelection(ids)
        ? undefined
        : async (cached) => {
            if (!contentSegments(cached.manifest, ids).length) return false;
            return Boolean(
              await info(
                path.join(releaseDirectory(c, cached.manifest, ids), `manifest-${c.platform}.json`),
              ),
            );
          },
    );
  }
  if (!ref) throw problem(`manifest not found for ${c.platform}: manifest-${c.platform}.json`);
  const selected = selectRemoteAssetManifestComponents(ref.manifest, ids);
  const release = releaseDirectory(c, ref.manifest, ids);
  if (!c.options.forceRefresh && (await releaseReady(release, c, required))) return release;
  const parts: { component: Component; source: string }[] = [];
  for (const component of selected) {
    const prefix = `${component.mount}/`;
    const paths = required
      .filter((relative) => relative.startsWith(prefix))
      .map((relative) => relative.slice(prefix.length));
    const source = await ensureComponent(
      c,
      component,
      ref.releaseBaseCandidatesForComponents,
      paths,
    );
    parts.push({ component, source });
  }
  return inReleaseOrder(path.resolve(release), () =>
    assemble(c, ref!.manifest, ids, parts, release),
  );
}

export async function ensureRemoteReleaseDirFromCdn(
  options: EnsureRemoteReleaseDirOptions,
  loggers: Loggers,
): Promise<string> {
  const c = context(options, loggers);
  if (!c)
    throw new Error(
      `[deploy] production remote assets require remoteCdnBaseUrl or remoteCdnBaseUrls, remoteCacheDir and platformArch (remoteCdnBaseUrl=${options.remoteCdnBaseUrl ?? "<empty>"}, remoteCdnBaseUrls=${JSON.stringify(options.remoteCdnBaseUrls ?? [])}, remoteCacheDir=${options.remoteCacheDir ?? "<empty>"}, platformArch=${options.platformArch ?? "<empty>"}).`,
    );
  const ids = requestedIds(options.componentIds);
  const required = [
    ...new Set(
      (options.requiredReleasePaths ?? []).map((relative) =>
        normalizeRemoteAssetRelativePath(relative, "requiredReleasePath"),
      ),
    ),
  ];
  const base = releaseBase(c);
  if (!options.forceRefresh && ordinarySelection(ids) && (await releaseReady(base, c, required)))
    return base;
  c.loggers.logWarn(
    `[remote-assets] download required: component=<release> reason=local cache missing or invalid path=${base}`,
  );
  const pinned =
    options.manifestRef === null
      ? "<missing-manifest>"
      : options.manifestRef
        ? contentSegments(options.manifestRef.manifest, ids).join("/") || "<unpinned>"
        : "<unpinned>";
  const key = [
    path.resolve(base),
    ids ? [...ids].sort().join(",") : "<all>",
    pinned,
    options.forceRefresh ? "force" : "reuse",
    timeoutIdentity(options),
  ].join("::");
  while (true) {
    const active = releaseTasks.get(key);
    if (active) {
      const shared = await active,
        missing = await absentPaths(shared, required);
      if (!missing.length) return shared;
      loggers.logWarn(
        `[remote-assets] locked release cache still incomplete: missing=${missing.join(",")}; redownloading`,
      );
      continue;
    }
    let task!: Promise<string>;
    task = (async () => {
      try {
        return await releaseOperation(c, ids, required);
      } finally {
        if (releaseTasks.get(key) === task) releaseTasks.delete(key);
      }
    })();
    releaseTasks.set(key, task);
    return task;
  }
}

export {
  createRemoteAssetManifestRequestSignal,
  buildRemoteAssetManifestFileCandidates,
  usesRemoteAssetContentAddressedCacheIdentity,
  resolveRemoteAssetComponentCacheVersion,
  resolveFallbackRemoteAssetCacheDir,
  selectRemoteAssetManifestComponents,
  parseRemoteAssetManifestFromResponse,
} from "./remoteAssetCacheModel.js";

export { readCachedRemoteAssetMarker } from "./remoteAssetCacheFiles.js";
