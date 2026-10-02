import { type RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";
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
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type Stats } from "node:fs";
import {
  constants as fsConstants,
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as wait } from "node:timers/promises";
import { fileExists } from "@knorvia/server/remote/deployShared.js";
import { extractTarGzArchive } from "@knorvia/server/remote/localTarGz.js";
import {
  assertRemoteCdnBaseVersionMatches,
  buildComponentArtifactUrlCandidates,
  buildReleaseAssetUrlCandidates,
  buildReleaseBaseCandidates,
  normalizeRemoteAssetRelativePath,
  resolveRemoteCdnBaseUrls,
} from "@knorvia/server/remote/remoteAssetCdn.js";
import { resolveRemoteAssetFetch } from "@knorvia/server/remote/remoteAssetNetwork.js";

type Component = RemoteAssetManifestComponent;
type Loggers = RemoteAssetCacheLoggers;
interface Context {
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
const markers = [".ready", ".remote-assets-ready"] as const;
const manifestTasks = new Map<string, Promise<RemoteAssetManifestRef | null>>();
const refreshTasks = new Map<string, Promise<RemoteAssetManifestRef | null>>();
const componentTasks = new Map<string, Promise<string>>();
const releaseTasks = new Map<string, Promise<string>>();
const releaseQueues = new Map<string, Promise<string>>();
const retryDelays = [50, 100, 200, 400, 800, 1600, 3200];

function problem(text: string): Error {
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
function requestedIds(values?: string[]): string[] | undefined {
  if (!values?.length) return undefined;
  const result = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  for (const id of result)
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw problem(`component id is invalid: ${id}`);
  return result.length ? result : undefined;
}
function context(options: EnsureRemoteReleaseDirOptions, loggers: Loggers): Context | null {
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
export async function readCachedRemoteAssetMarker(cacheDir: string): Promise<string | null> {
  for (const marker of markers) {
    try {
      return await readFile(path.join(cacheDir, marker), "utf8");
    } catch {}
  }
  return null;
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
function timeoutIdentity(options: EnsureRemoteReleaseDirOptions): string {
  return options.manifestRequestTimeoutMs == null
    ? "default"
    : String(options.manifestRequestTimeoutMs);
}
function manifestIdentity(c: Context): string {
  return [
    path.resolve(c.cache),
    c.version,
    c.platform,
    timeoutIdentity(c.options),
    ...c.bases,
  ].join("::");
}
async function requestManifest(c: Context): Promise<RemoteAssetManifestRef | null> {
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
    const result = await startManifest(c, key, false);
    return refreshTasks.get(key) ?? result;
  }
  const retained = await cached;
  if (refreshTasks.has(key)) return refreshTasks.get(key)!;
  const newer = manifestTasks.get(key);
  if (newer && newer !== cached) return newer;
  const wantsRefresh =
    retained !== null &&
    (Boolean(c.options.refreshManifest) || (decide !== undefined && (await decide(retained))));
  if (refreshTasks.has(key)) return refreshTasks.get(key)!;
  const afterDecision = manifestTasks.get(key);
  if (afterDecision && afterDecision !== cached) return afterDecision;
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

async function info(target: string) {
  try {
    return await stat(target);
  } catch {
    return undefined;
  }
}
async function markedDirectory(dir: string): Promise<boolean> {
  if (!(await info(dir))?.isDirectory()) return false;
  for (const marker of markers) if (await fileExists(dir, marker)) return true;
  return false;
}
async function fullRelease(dir: string, platform: string): Promise<boolean> {
  if (!(await info(dir))?.isDirectory()) return false;
  if (!(await fileExists(dir, "server", "knorvia-server.cjs"))) return false;
  if (!(await fileExists(dir, "node", platform, "node"))) return false;
  for (const marker of markers) if (await fileExists(dir, marker)) return true;
  return false;
}
function contained(base: string, relative: string, label: string): string {
  const normalized = normalizeRemoteAssetRelativePath(relative, label);
  const root = path.resolve(base),
    target = path.resolve(root, normalized);
  const distance = path.relative(root, target);
  if (distance === ".." || distance.startsWith(`..${path.sep}`) || path.isAbsolute(distance))
    throw problem(`${label} escapes base dir: ${relative}`);
  return target;
}
async function absentPaths(base: string, required: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const relative of required) {
    const target = contained(base, relative, "required cache path");
    if (!(await info(target))) missing.push(target);
  }
  return missing;
}
async function componentReadiness(dir: string, required: readonly string[]) {
  if (!(await markedDirectory(dir)))
    return { ready: false, missing: [] as string[], marked: false };
  const missing = await absentPaths(dir, required);
  return { ready: missing.length === 0, missing, marked: true };
}
async function releaseReady(
  dir: string,
  c: Context,
  required: readonly string[],
): Promise<boolean> {
  return (await fullRelease(dir, c.platform)) && (await absentPaths(dir, required)).length === 0;
}
async function markerAt(dir: string): Promise<void> {
  await writeFile(path.join(dir, ".ready"), `${Date.now()}\n`, "utf8");
}
function stageAt(c: Context, label: string): string {
  return path.join(c.cache, "staging", `${label}-${process.pid}-${randomUUID()}`);
}
function retryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(String(error.code))
  );
}
async function retryFs(action: () => Promise<void>): Promise<void> {
  let retry = 0;
  while (true) {
    try {
      await action();
      return;
    } catch (error) {
      const delay = retryDelays[retry];
      if (delay === undefined || !retryable(error)) throw error;
      retry++;
      await wait(delay);
    }
  }
}
async function commitDirectory(staged: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  let backup: string | undefined;
  if (await info(target)) {
    backup = `${target}.backup-${process.pid}-${randomUUID()}`;
    await retryFs(() => rename(target, backup!));
  }
  try {
    await retryFs(() => rename(staged, target));
  } catch (commitError) {
    if (backup !== undefined) {
      try {
        await retryFs(() => rename(backup!, target));
      } catch (restoreError) {
        throw problem(
          `failed to commit staged directory and failed to restore backup: commit=${String(commitError)}, restore=${String(restoreError)}`,
        );
      }
    }
    throw commitError;
  }
  if (backup !== undefined) {
    try {
      await retryFs(() => rm(backup!, { recursive: true, force: true }));
    } catch {}
  }
}
async function materialize(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".ready" || entry.name === ".remote-assets-ready") continue;
    const from = path.join(source, entry.name),
      to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw problem(`symlink is not allowed in component cache: ${from}`);
    if (entry.isDirectory()) {
      await materialize(from, to);
      continue;
    }
    if (!entry.isFile()) throw problem(`unsupported component entry type: ${from}`);
    try {
      await link(from, to);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (!["EXDEV", "EPERM", "EACCES", "EMLINK"].includes(String(code))) throw error;
      await copyFile(from, to, fsConstants.COPYFILE_EXCL);
    }
  }
}
async function nonempty(dir: string, message: string): Promise<void> {
  if ((await readdir(dir)).length === 0) throw problem(message);
}
async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
async function unpackedDigest(root: string): Promise<string> {
  const hash = createHash("sha256"),
    rootInfo = await stat(root);
  const appendFile = async (absolute: string, relative: string, details: Stats) => {
    hash.update(`file:${relative}:${details.mode & 0o777}:${details.size}\n`);
    for await (const bytes of createReadStream(absolute)) hash.update(bytes);
  };
  const visit = async (absolute: string, prefix: string): Promise<void> => {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const item = path.join(absolute, entry.name),
        relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const details = await stat(item);
        hash.update(`dir:${relative}:${details.mode & 0o777}\n`);
        await visit(item, relative);
      } else if (entry.isFile()) await appendFile(item, relative, await stat(item));
      else throw new Error(`unsupported entry type: ${item}`);
    }
  };
  if (rootInfo.isDirectory()) {
    hash.update("root:dir\n");
    await visit(root, "");
  } else if (rootInfo.isFile()) {
    hash.update("root:file\n");
    await appendFile(root, "root-file", rootInfo);
  } else throw new Error(`unsupported path type: ${root}`);
  return hash.digest("hex");
}
async function download(response: Response, destination: string, loggers: Loggers): Promise<void> {
  if (!response.body) throw new Error("response body is empty");
  await mkdir(path.dirname(destination), { recursive: true });
  const rawTotal = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  const total = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : undefined;
  const started = Date.now();
  let transferred = 0,
    lastTime = 0,
    lastPercent = 0,
    lastTransferred = -1;
  const report = (forced: boolean) => {
    const now = Date.now(),
      percent = total === undefined ? undefined : Math.min((transferred / total) * 100, 100);
    if (
      forced &&
      lastTransferred === transferred &&
      (percent === undefined || percent <= lastPercent)
    )
      return;
    if (
      !forced &&
      now - lastTime < 1000 &&
      (percent === undefined || (percent - lastPercent < 5 && percent < 100))
    )
      return;
    const megabytes = transferred / (1024 * 1024),
      speed = megabytes / Math.max((now - started) / 1000, 0.001);
    loggers.log(
      percent === undefined
        ? `[remote-assets] download progress: ${megabytes.toFixed(1)} MB (total unknown, ${speed.toFixed(2)} MB/s)`
        : `[remote-assets] download progress: ${percent.toFixed(1)}% (${megabytes.toFixed(1)}/${(total! / (1024 * 1024)).toFixed(1)} MB, ${speed.toFixed(2)} MB/s)`,
    );
    lastTime = now;
    lastTransferred = transferred;
    if (percent !== undefined) lastPercent = percent;
  };
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        transferred += chunk.byteLength;
        report(false);
        callback(null, chunk);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    meter,
    createWriteStream(destination),
  );
  report(true);
}
async function artifactResponse(
  c: Context,
  component: Component,
  bases: string[],
): Promise<Response> {
  const urls = buildComponentArtifactUrlCandidates(bases, component.artifactPath, c.version);
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

function componentRoot(c: Context, component: Component): string {
  if (!Object.prototype.hasOwnProperty.call(componentRules, component.id))
    throw problem(`component id is not in local whitelist: ${component.id}`);
  return componentRules[component.id]!.root(c.cache, c.platform);
}
function componentDirectory(c: Context, component: Component): string {
  return path.join(
    componentRoot(c, component),
    usesRemoteAssetContentAddressedCacheIdentity(component.id)
      ? component.sha256
      : resolveRemoteAssetComponentCacheVersion(component.version),
  );
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
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return false;
  }
  let choice: { dir: string; name: string; time: number } | undefined;
  for (const name of entries) {
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
  let versions: string[];
  try {
    versions = await readdir(releases);
  } catch {
    return false;
  }
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
async function componentOperation(
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
  const stage = stageAt(c, `remote-component-${component.id}-${c.platform}-${component.version}`);
  const archive = path.join(stage, "component.tar.gz"),
    extracted = path.join(stage, "extract");
  try {
    const response = await artifactResponse(c, component, bases);
    await download(response, archive, c.loggers);
    const digest = await digestFile(archive);
    if (digest !== component.sha256)
      throw problem(
        `sha256 mismatch for ${component.id}@${component.version}: expected=${component.sha256}, actual=${digest}`,
      );
    await mkdir(extracted, { recursive: true });
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
function contentSegments(manifest: RemoteAssetManifest, ids: string[] | undefined): string[] {
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
function releaseBase(c: Context): string {
  return path.join(c.cache, "releases", c.version, c.platform);
}
function releaseDirectory(
  c: Context,
  manifest: RemoteAssetManifest,
  ids: string[] | undefined,
): string {
  return path.join(releaseBase(c), ...contentSegments(manifest, ids));
}
function ordinarySelection(ids: string[] | undefined): boolean {
  return ids !== undefined && !ids.includes("server-bundle") && !ids.includes("knorvia");
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
async function assemble(
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
    ref = await manifestFor(fetchContext, async (cached) => {
      if (!contentSegments(cached.manifest, ids).length) return false;
      return Boolean(
        await info(
          path.join(releaseDirectory(c, cached.manifest, ids), `manifest-${c.platform}.json`),
        ),
      );
    });
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
