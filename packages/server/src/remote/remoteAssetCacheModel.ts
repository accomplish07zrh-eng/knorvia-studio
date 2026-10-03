// Internal partition of the same root-authored cache owner; no new rights claim.
import path from "node:path";
import os from "node:os";
import {
  assertRemoteCdnBaseVersionMatches,
  buildReleaseAssetUrlCandidates,
  buildReleaseBaseCandidates,
  normalizeRemoteAssetRelativePath,
  resolveRemoteCdnBaseUrls,
} from "@knorvia/server/remote/remoteAssetCdn.js";
import { resolveRemoteAssetFetch } from "@knorvia/server/remote/remoteAssetNetwork.js";
import type {
  RemoteAssetManifest,
  RemoteAssetManifestComponent,
  RemoteAssetManifestRef,
  RemoteAssetCacheLoggers,
  EnsureRemoteReleaseDirOptions,
} from "./remoteAssetCache.js";

export type Component = RemoteAssetManifestComponent;

export type Loggers = RemoteAssetCacheLoggers;

export interface Context {
  options: EnsureRemoteReleaseDirOptions;
  cache: string;
  version: string;
  platform: string;
  bases: string[];
  loggers: Loggers;
}

interface ComponentRule {
  mount: (platform: string) => string;
  root: (cache: string, platform: string) => string;
}

const componentRules: Record<string, ComponentRule> = {
  "server-bundle": {
    mount: () => "server",
    root: (c) => path.join(c, "components", "server-bundle"),
  },
  "node-runtime": {
    mount: (p) => `node/${p}`,
    root: (c, p) => path.join(c, "components", "node-runtime", p),
  },
  "node-pty": {
    mount: (p) => `node-pty/${p}`,
    root: (c, p) => path.join(c, "components", "node-pty", p),
  },
  knorvia: {
    mount: (p) => `knorvia/${p}`,
    root: (c, p) => path.join(c, "components", "knorvia", p),
  },
  bfs: { mount: (p) => `tools/${p}/bfs`, root: (c, p) => path.join(c, "components", "bfs", p) },
  ripgrep: {
    mount: (p) => `tools/${p}/ripgrep`,
    root: (c, p) => path.join(c, "components", "ripgrep", p),
  },
  ugrep: {
    mount: (p) => `tools/${p}/ugrep`,
    root: (c, p) => path.join(c, "components", "ugrep", p),
  },
};

// The inherited-key edge is part of the published compatibility contract.
const contentIdentities: Record<string, boolean> = { "server-bundle": true, knorvia: true };

export function problem(text: string): Error {
  return new Error(`[remote-assets] ${text}`);
}

function safeSegment(value: string, label: string): void {
  if (!value) throw problem(`${label} is empty`);
  if (/[\\/]/u.test(value)) throw problem(`${label} must be a single path segment: ${value}`);
  if (value === "." || value === "..") throw problem(`${label} is invalid: ${value}`);
}

function textField(value: Record<string, unknown>, field: string, label: string): string {
  const raw = value[field];
  if (typeof raw !== "string") throw problem(`${label}.${field} must be string`);
  const result = raw.trim();
  if (!result) throw problem(`${label}.${field} is empty`);
  return result;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requestedIds(values?: string[]): string[] | undefined {
  if (!values?.length) return undefined;
  const result = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  for (const id of result)
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw problem(`component id is invalid: ${id}`);
  return result.length ? result : undefined;
}

export function context(options: EnsureRemoteReleaseDirOptions, loggers: Loggers): Context | null {
  const bases = resolveRemoteCdnBaseUrls(options);
  const version = options.version?.trim() ?? "";
  const platform = options.platformArch?.trim() ?? "";
  const cache = options.remoteCacheDir?.trim() ?? "";
  if (!bases.length || !version || !platform || !cache) return null;
  safeSegment(version, "appVersion");
  safeSegment(platform, "platformArch");
  assertRemoteCdnBaseVersionMatches(bases, version);
  return { options, cache, version, platform, bases, loggers };
}

export function createRemoteAssetManifestRequestSignal(timeoutMs = 10000): AbortSignal {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw problem(`manifest request timeout must be a positive safe integer: ${String(timeoutMs)}`);
  return AbortSignal.timeout(timeoutMs);
}

export function buildRemoteAssetManifestFileCandidates(platformArch: string): string[] {
  return [`manifest-${platformArch}.json`];
}

export function usesRemoteAssetContentAddressedCacheIdentity(componentId: string): boolean {
  return Boolean(contentIdentities[componentId]);
}

export function resolveRemoteAssetComponentCacheVersion(version: string): string {
  const plus = version.lastIndexOf("+");
  return plus >= 0 && /^[a-f0-9]{12,64}$/iu.test(version.slice(plus + 1))
    ? version.slice(0, plus)
    : version;
}

export function resolveFallbackRemoteAssetCacheDir(): string {
  return path.join(os.tmpdir(), "knorvia-remote-assets-cache");
}

export function selectRemoteAssetManifestComponents(
  manifest: RemoteAssetManifest,
  componentIds?: string[],
): RemoteAssetManifestComponent[] {
  const wanted = requestedIds(componentIds);
  if (!wanted) return manifest.components;
  const present = new Set(manifest.components.map((c) => c.id));
  const missing = wanted.filter((id) => !present.has(id));
  if (missing.length)
    throw problem(`manifest is missing requested components: ${missing.join(", ")}`);
  const selected = new Set(wanted);
  return manifest.components.filter((c) => selected.has(c.id));
}

export async function parseRemoteAssetManifestFromResponse(
  response: Response,
  sourceUrl: string,
  expectedAppVersion: string,
  expectedPlatformArch: string,
): Promise<RemoteAssetManifest> {
  const body = await response.text();
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch (error) {
    throw problem(`invalid manifest json from ${sourceUrl}: ${String(error)}`);
  }
  if (!record(input)) throw problem(`invalid manifest payload from ${sourceUrl}: expect object`);
  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion))
    throw problem("manifest.schemaVersion must be finite number");
  if (!Number.isInteger(schemaVersion) || schemaVersion !== 1)
    throw problem(`unsupported manifest schemaVersion=${schemaVersion} from ${sourceUrl}`);
  const appVersion = textField(input, "appVersion", "manifest");
  if (appVersion !== expectedAppVersion)
    throw problem(
      `manifest appVersion mismatch from ${sourceUrl}: expected=${expectedAppVersion}, actual=${appVersion}`,
    );
  const platformArch = textField(input, "platformArch", "manifest");
  if (platformArch !== expectedPlatformArch)
    throw problem(
      `manifest platformArch mismatch from ${sourceUrl}: expected=${expectedPlatformArch}, actual=${platformArch}`,
    );
  if (!Array.isArray(input.components))
    throw problem(`manifest.components must be array from ${sourceUrl}`);
  if (!input.components.length) throw problem(`manifest.components is empty from ${sourceUrl}`);
  const components: Component[] = [],
    seen = new Set<string>();
  for (const [index, raw] of input.components.entries()) {
    const label = `manifest.components[${index}]`;
    if (!record(raw)) throw problem(`${label} must be object`);
    const id = textField(raw, "id", label);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw problem(`${label}.id is invalid: ${id}`);
    if (seen.has(id)) throw problem(`duplicate component id in manifest: ${id}`);
    seen.add(id);
    const rule = componentRules[id];
    if (!rule) continue;
    const version = textField(raw, "version", label);
    safeSegment(version, `${label}.version`);
    const sha256 = textField(raw, "sha256", label).toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha256)) throw problem(`${label}.sha256 is invalid`);
    const artifactPath = normalizeRemoteAssetRelativePath(
      textField(raw, "artifactPath", label),
      `${label}.artifactPath`,
    );
    const mount = normalizeRemoteAssetRelativePath(
      textField(raw, "mount", label),
      `${label}.mount`,
    );
    const expectedMount = normalizeRemoteAssetRelativePath(
      rule.mount(platformArch),
      `expected mount for ${id}`,
    );
    if (mount !== expectedMount)
      throw problem(
        `${label}.mount mismatch for ${id}: expected=${expectedMount}, actual=${mount}`,
      );
    components.push({ id, version, sha256, artifactPath, mount });
  }
  return { schemaVersion, appVersion, platformArch, components };
}

export function timeoutIdentity(options: EnsureRemoteReleaseDirOptions): string {
  return options.manifestRequestTimeoutMs == null
    ? "default"
    : String(options.manifestRequestTimeoutMs);
}

export function manifestIdentity(c: Context): string {
  return [
    path.resolve(c.cache),
    c.version,
    c.platform,
    timeoutIdentity(c.options),
    ...c.bases,
  ].join("::");
}

export async function requestManifest(c: Context): Promise<RemoteAssetManifestRef | null> {
  const bases = buildReleaseBaseCandidates(c.bases, c.version);
  const files = buildRemoteAssetManifestFileCandidates(c.platform);
  const urls = buildReleaseAssetUrlCandidates(bases, files);
  const fetch = resolveRemoteAssetFetch(c.options.remoteAssetNetwork),
    failures: string[] = [];
  for (const url of urls) {
    const signal = createRemoteAssetManifestRequestSignal(c.options.manifestRequestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      failures.push(`${url} -> ${String(error)}`);
      continue;
    }
    if (!response.ok) {
      if (response.status !== 404) failures.push(`${url} -> HTTP ${response.status}`);
      continue;
    }
    let manifest: RemoteAssetManifest;
    try {
      manifest = await parseRemoteAssetManifestFromResponse(response, url, c.version, c.platform);
    } catch (error) {
      if (!signal.aborted) throw error;
      failures.push(`${url} -> ${String(error)}`);
      continue;
    }
    c.loggers.log(`[remote-assets] downloading ${url}`);
    let selected: string | undefined;
    for (const raw of bases) {
      const base = raw.replace(/\/+$/u, "");
      if (
        base &&
        (url === base || url.startsWith(`${base}/`)) &&
        (selected === undefined || base.length > selected.length)
      )
        selected = base;
    }
    return {
      manifest,
      releaseBaseCandidatesForComponents:
        selected === undefined ? bases : [selected, ...bases.filter((base) => base !== selected)],
    };
  }
  if (failures.length) throw problem(`failed to fetch ${files[0]}: ${failures.join("; ")}`);
  return null;
}

export function componentRoot(c: Context, component: Component): string {
  if (!Object.prototype.hasOwnProperty.call(componentRules, component.id))
    throw problem(`component id is not in local whitelist: ${component.id}`);
  return componentRules[component.id]!.root(c.cache, c.platform);
}

export function componentDirectory(c: Context, component: Component): string {
  return path.join(
    componentRoot(c, component),
    usesRemoteAssetContentAddressedCacheIdentity(component.id)
      ? component.sha256
      : resolveRemoteAssetComponentCacheVersion(component.version),
  );
}

export function contentSegments(
  manifest: RemoteAssetManifest,
  ids: string[] | undefined,
): string[] {
  const selected = selectRemoteAssetManifestComponents(manifest, ids),
    tail: string[] = [];
  for (const [id, prefix] of [
    ["server-bundle", "server-content"],
    ["knorvia", "knorvia-content"],
  ] as const) {
    if (ids ? !ids.includes(id) : id === "server-bundle") continue;
    const component = selected.find((item) => item.id === id);
    if (component) tail.push(prefix, component.sha256);
  }
  return tail;
}

export function releaseBase(c: Context): string {
  return path.join(c.cache, "releases", c.version, c.platform);
}

export function releaseDirectory(
  c: Context,
  manifest: RemoteAssetManifest,
  ids: string[] | undefined,
): string {
  return path.join(releaseBase(c), ...contentSegments(manifest, ids));
}

export function ordinarySelection(ids: string[] | undefined): boolean {
  return ids !== undefined && !ids.some(usesRemoteAssetContentAddressedCacheIdentity);
}
