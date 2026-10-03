/* eslint-disable max-lines -- Keep both materialization paths in one owner to preserve compatibility ordering. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import type { RemoteAssetInstallMode } from "@knorvia/shared";
import type { IRemoteBackend, StdioStream } from "@knorvia/server/remote/backend.js";
import {
  REMOTE_BASE,
  buildRemoteExecutableReplaceCommand,
  buildRemoteMoveCommand,
  createRemoteAssetPlaceholderError,
  fileExists,
  waitForClose,
  type DeployLoggers,
  type RemoteAssetDeployOptions,
} from "@knorvia/server/remote/deployShared.js";
import { createTarGzArchive } from "@knorvia/server/remote/localTarGz.js";
import { quotePosixPathArg, quotePosixShellArg } from "@knorvia/server/remote/posixShell.js";
import {
  buildRemoteAssetManifestFileCandidates,
  createRemoteAssetManifestRequestSignal,
  ensureRemoteReleaseDirFromCdn,
  parseRemoteAssetManifestFromResponse,
  resolveRemoteAssetComponentCacheVersion,
  selectRemoteAssetManifestComponents,
  usesRemoteAssetContentAddressedCacheIdentity,
  type RemoteAssetManifestComponent,
  type RemoteAssetManifestRef,
} from "@knorvia/server/remote/remoteAssetCache.js";
import {
  buildComponentArtifactUrlCandidates,
  buildReleaseAssetUrlCandidates,
  buildReleaseBaseCandidates,
  resolveRemoteCdnBaseUrls,
} from "@knorvia/server/remote/remoteAssetCdn.js";
import {
  resolveRemoteAssetFetch,
  type RemoteAssetNetworkPort,
} from "@knorvia/server/remote/remoteAssetNetwork.js";
import type {
  RemoteAssetTools,
  RemoteDownloadTool,
  RemoteSha256Tool,
} from "@knorvia/server/remote/remoteAssetPreflight.js";

export interface RemoteAssetInstaller {
  readonly mode: RemoteAssetInstallMode;
  resolveComponentVersion?(id: string): Promise<string | null>;
  resolveComponentSha256?(id: string): Promise<string | null>;
  installFile(params: {
    componentId: string;
    sourceRelativePath: string;
    remotePath: string;
    executable?: boolean;
    forceRefresh?: boolean;
  }): Promise<void>;
  installDirectory(params: {
    componentId: string;
    sourceRelativePath: string;
    remoteDir: string;
    requiredRelativePaths?: string[];
    forceRefresh?: boolean;
  }): Promise<void>;
}

export type RemoteManifestRef = RemoteAssetManifestRef;

export type RemoteDownloadAssetInstallerOptions = RemoteAssetDeployOptions & {
  version: string;
  platformArch: string;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteAssetNetwork?: RemoteAssetNetworkPort;
};

type FileInstallParams = Parameters<RemoteAssetInstaller["installFile"]>[0];
type DirectoryInstallParams = Parameters<RemoteAssetInstaller["installDirectory"]>[0];

function checkCanceled(options: RemoteAssetDeployOptions): void {
  const signal = options.signal;
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Remote asset installation canceled");
  error.name = "AbortError";
  throw error;
}

function staleStagingCommand(parent: string, patterns: string[]): string {
  const candidates = patterns.map((pattern) => {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return `${quotePosixPathArg(parent)}/${quotePosixShellArg(prefix)}*`;
  });
  return [
    `for candidate in ${candidates.join(" ")}; do`,
    'test -e "$candidate" || continue',
    'find "$candidate" -prune -mtime +0 -exec rm -rf {} + 2>/dev/null || true',
    "done",
  ].join("\n");
}

async function missingLocalReleasePaths(
  releaseDir: string,
  required: readonly string[] | undefined,
): Promise<string[]> {
  const missing: string[] = [];
  for (const relative of required ?? []) {
    const absolute = join(releaseDir, relative);
    if (!(await fileExists(absolute))) missing.push(absolute);
  }
  return missing;
}

function requiredDirectoryReleasePaths(
  sourceRelativePath: string,
  requiredRelativePaths: string[] | undefined,
): string[] {
  const source = sourceRelativePath.replace(/^\/+|\/+$/gu, "");
  if (!source) return [];
  const paths = [source];
  for (const required of requiredRelativePaths ?? []) {
    const normalized = required.replace(/^\/+|\/+$/gu, "");
    if (normalized.length === 0) continue;
    paths.push(posix.join(source, normalized));
  }
  return paths;
}

export class LocalUploadAssetInstaller implements RemoteAssetInstaller {
  readonly mode = "local-download-upload" as const;

  constructor(
    private readonly backend: IRemoteBackend,
    private readonly options: RemoteAssetDeployOptions & {
      platformArch?: string;
      version?: string;
    },
    private readonly loggers: DeployLoggers,
  ) {}

  async resolveComponentVersion(id: string): Promise<string | null> {
    return (await this.lookupLocalComponent(id))?.version ?? null;
  }

  async resolveComponentSha256(id: string): Promise<string | null> {
    const resolved = await this.options.resolveComponentSha256?.(id);
    if (resolved) return resolved;
    return (await this.lookupLocalComponent(id))?.sha256 ?? null;
  }

  private async lookupLocalComponent(id: string): Promise<RemoteAssetManifestComponent | null> {
    const platformArch = this.options.platformArch?.trim();
    const releaseDir =
      this.options.releaseDir?.trim() ?? (await this.options.resolveReleaseDir?.([id]))?.trim();
    if (!platformArch || !releaseDir) return null;
    try {
      const manifest = JSON.parse(
        readFileSync(join(releaseDir, `manifest-${platformArch}.json`), "utf8"),
      );
      return selectRemoteAssetManifestComponents(manifest, [id])[0] ?? null;
    } catch {
      return null;
    }
  }

  async tryResolveLocalPath(
    ids: string[],
    source: string,
    required?: string[],
    force = false,
  ): Promise<string | null> {
    const releaseDir =
      this.options.releaseDir ??
      (await this.options.resolveReleaseDir?.(ids, { forceRefresh: force })) ??
      null;
    if (!releaseDir) return null;
    const localPath = join(releaseDir, source);
    if (await fileExists(localPath)) {
      const missing = await missingLocalReleasePaths(releaseDir, required);
      if (missing.length === 0) return localPath;
      this.loggers.logWarn(
        `[remote-assets] local release asset incomplete: source=${localPath} missing=${missing.join(",")}; trying CDN cache fallback`,
      );
    }
    const cdnDir = await this.resolveCdnFallback(ids, required, force);
    if (!cdnDir) return null;
    const cdnLocalPath = join(cdnDir, source);
    if (!(await fileExists(cdnLocalPath))) return null;
    const missing = await missingLocalReleasePaths(cdnDir, required);
    if (missing.length > 0) {
      this.loggers.logWarn(
        `[remote-assets] CDN release asset incomplete: source=${cdnLocalPath} missing=${missing.join(",")}`,
      );
      return null;
    }
    return cdnLocalPath;
  }

  async resolveLocalPath(
    ids: string[],
    source: string,
    required?: string[],
    force = false,
  ): Promise<string> {
    const localPath = await this.tryResolveLocalPath(ids, source, required, force);
    if (localPath) return localPath;
    const releaseDir =
      this.options.releaseDir ??
      (await this.options.resolveReleaseDir?.(ids, { forceRefresh: force })) ??
      null;
    if (!releaseDir) {
      throw createRemoteAssetPlaceholderError(
        this.options.platformArch ?? "<unknown>",
        this.options,
        ids.join(","),
      );
    }
    throw new Error(
      `[deploy] local remote asset not found: ${join(releaseDir, source)} (component=${ids.join(",")})`,
    );
  }

  private async resolveCdnFallback(
    ids: string[],
    required: string[] | undefined,
    force: boolean,
  ): Promise<string | null> {
    const platformArch = this.options.platformArch?.trim();
    const version = this.options.version?.trim();
    if (!platformArch || !version || !this.options.remoteCacheDir) return null;
    const enabled =
      Boolean(this.options.remoteCdnBaseUrl?.trim()) ||
      (this.options.remoteCdnBaseUrls?.some((url) => url.trim().length > 0) ?? false);
    if (!enabled) return null;
    try {
      return await ensureRemoteReleaseDirFromCdn(
        {
          remoteCdnBaseUrl: this.options.remoteCdnBaseUrl,
          remoteCdnBaseUrls: this.options.remoteCdnBaseUrls,
          remoteCacheDir: this.options.remoteCacheDir,
          version,
          platformArch,
          componentIds: ids,
          requiredReleasePaths: required,
          manifestRequestTimeoutMs: this.options.manifestRequestTimeoutMs,
          remoteAssetNetwork: this.options.remoteAssetNetwork,
          forceRefresh: force,
        },
        this.loggers,
      );
    } catch (error) {
      this.loggers.logWarn(
        `[remote-assets] local upload CDN fallback failed for ${ids.join(",")}: ${String(error)}`,
      );
      if (force) throw error;
      return null;
    }
  }

  async installFile(params: FileInstallParams): Promise<void> {
    checkCanceled(this.options);
    const localPath = await this.resolveLocalPath(
      [params.componentId],
      params.sourceRelativePath,
      undefined,
      Boolean(params.forceRefresh),
    );
    checkCanceled(this.options);
    const staging = `${params.remotePath}.new-${Date.now()}-${randomUUID()}`;
    this.loggers.log(
      `[remote-assets] uploading ${params.sourceRelativePath} to ${params.remotePath}`,
    );
    const parent = posix.dirname(params.remotePath);
    try {
      const preparation: string[] = [];
      if (this.options.signal) {
        preparation.push(
          staleStagingCommand(parent, [`${posix.basename(params.remotePath)}.new-*`]),
        );
      }
      preparation.push(`mkdir -p ${quotePosixPathArg(parent)}`);
      await waitForClose(await this.backend.exec(preparation.join("\n")));
      await this.backend.upload(localPath, staging, { signal: this.options.signal });
      checkCanceled(this.options);
      const replacement = params.executable
        ? buildRemoteExecutableReplaceCommand(staging, params.remotePath)
        : buildRemoteMoveCommand(staging, params.remotePath);
      await waitForClose(await this.backend.exec(replacement));
    } catch (error) {
      if (!this.options.signal?.aborted) {
        try {
          await waitForClose(await this.backend.exec(`rm -f ${quotePosixPathArg(staging)}`));
        } catch (cleanupError) {
          this.loggers.logWarn(
            `[remote-assets] failed to clean owned file staging ${staging}: ${String(cleanupError)}`,
          );
        }
      }
      throw error;
    }
  }

  async installDirectory(params: DirectoryInstallParams): Promise<void> {
    checkCanceled(this.options);
    const localPath = await this.resolveLocalPath(
      [params.componentId],
      params.sourceRelativePath,
      requiredDirectoryReleasePaths(params.sourceRelativePath, params.requiredRelativePaths),
      Boolean(params.forceRefresh),
    );
    const localTarPath = join(
      tmpdir(),
      `knorvia-remote-${params.componentId}-${Date.now()}-${randomUUID()}.tar.gz`,
    );
    await createTarGzArchive(localTarPath, [
      { sourcePath: localPath, archivePath: basename(localPath) },
    ]);
    const suffix = `${Date.now()}-${randomUUID()}`;
    const remoteTarPath = `${params.remoteDir}.tar.gz-${suffix}`;
    const remoteExtractDir = `${params.remoteDir}.extract-${suffix}`;
    const extractedSource = `${remoteExtractDir}/${basename(localPath)}`;
    try {
      checkCanceled(this.options);
      this.loggers.log(
        `[remote-assets] uploading ${params.sourceRelativePath} to ${params.remoteDir}`,
      );
      const parent = posix.dirname(params.remoteDir);
      const remoteName = posix.basename(params.remoteDir);
      const preparation: string[] = [];
      if (this.options.signal) {
        preparation.push(
          staleStagingCommand(parent, [`${remoteName}.tar.gz-*`, `${remoteName}.extract-*`]),
        );
      }
      preparation.push(`mkdir -p ${quotePosixPathArg(parent)}`);
      await waitForClose(await this.backend.exec(preparation.join("\n")));
      await this.backend.upload(localTarPath, remoteTarPath, { signal: this.options.signal });
      checkCanceled(this.options);
      const tar = quotePosixPathArg(remoteTarPath);
      const extract = quotePosixPathArg(remoteExtractDir);
      const command = [
        "set -eu",
        `cleanup_staging() { rm -f ${tar}; rm -rf ${extract}; }`,
        "trap cleanup_staging EXIT HUP INT TERM",
        `rm -rf ${extract}`,
        `mkdir -p ${extract} ${quotePosixPathArg(posix.dirname(params.remoteDir))}`,
        `tar -xzf ${tar} -C ${extract}`,
        `test -d ${quotePosixPathArg(extractedSource)}`,
        `rm -rf ${quotePosixPathArg(params.remoteDir)}`,
        buildRemoteMoveCommand(extractedSource, params.remoteDir),
        "cleanup_staging",
        "trap - EXIT HUP INT TERM",
      ].join("\n");
      await waitForClose(await this.backend.exec(command));
    } catch (error) {
      if (!this.options.signal?.aborted) {
        try {
          await waitForClose(
            await this.backend.exec(
              `rm -f ${quotePosixPathArg(remoteTarPath)} && rm -rf ${quotePosixPathArg(remoteExtractDir)}`,
            ),
          );
        } catch (cleanupError) {
          this.loggers.logWarn(
            `[remote-assets] failed to clean owned directory staging ${suffix}: ${String(cleanupError)}`,
          );
        }
      }
      throw error;
    } finally {
      try {
        unlinkSync(localTarPath);
      } catch {
        // 临时归档清理失败不得覆盖安装结果。
      }
    }
  }
}

interface RemoteComponentRef {
  component: RemoteAssetManifestComponent;
  componentDir: string;
  fromCache: boolean;
}

function mapComponentSource(ref: RemoteComponentRef, source: string): string {
  const mount = ref.component.mount.replace(/\/+$/u, "");
  const normalized = source.replace(/^\/+|\/+$/gu, "");
  const relative =
    normalized === mount
      ? "."
      : normalized.startsWith(`${mount}/`)
        ? normalized.slice(mount.length + 1)
        : normalized;
  return relative === "." ? `${ref.componentDir}/.` : `${ref.componentDir}/${relative}`;
}

export class RemoteDownloadAssetInstaller implements RemoteAssetInstaller {
  readonly mode = "remote-download" as const;
  private readonly manifestPromise: Promise<RemoteManifestRef>;
  private readonly components = new Map<string, Promise<RemoteComponentRef>>();
  private readonly forceComponents = new Map<string, Promise<RemoteComponentRef>>();

  constructor(
    private readonly backend: IRemoteBackend,
    private readonly options: RemoteDownloadAssetInstallerOptions,
    private readonly tools: RemoteAssetTools,
    private readonly loggers: DeployLoggers,
    manifestPromise?: Promise<RemoteManifestRef>,
  ) {
    this.manifestPromise = manifestPromise ?? fetchRemoteDownloadManifest(options, loggers);
  }

  async resolveComponentVersion(id: string): Promise<string | null> {
    const { manifest } = await this.manifestPromise;
    return selectRemoteAssetManifestComponents(manifest, [id])[0]?.version ?? null;
  }

  async resolveComponentSha256(id: string): Promise<string | null> {
    const { manifest } = await this.manifestPromise;
    return selectRemoteAssetManifestComponents(manifest, [id])[0]?.sha256 ?? null;
  }

  async installFile(params: FileInstallParams): Promise<void> {
    checkCanceled(this.options);
    const ref = await this.ensureComponent(params.componentId, [], Boolean(params.forceRefresh));
    checkCanceled(this.options);
    const source = mapComponentSource(ref, params.sourceRelativePath);
    const staging = `${params.remotePath}.new-${Date.now()}-${randomUUID()}`;
    const command = [
      `mkdir -p ${quotePosixPathArg(posix.dirname(params.remotePath))}`,
      `cp -f ${quotePosixPathArg(source)} ${quotePosixPathArg(staging)}`,
      params.executable
        ? buildRemoteExecutableReplaceCommand(staging, params.remotePath)
        : buildRemoteMoveCommand(staging, params.remotePath),
    ].join(" && ");
    await waitForClose(await this.backend.exec(command));
  }

  async installDirectory(params: DirectoryInstallParams): Promise<void> {
    checkCanceled(this.options);
    const ref = await this.ensureComponent(
      params.componentId,
      params.requiredRelativePaths,
      Boolean(params.forceRefresh),
    );
    checkCanceled(this.options);
    const source = mapComponentSource(ref, params.sourceRelativePath);
    const staging = `${params.remoteDir}.new-${Date.now()}-${randomUUID()}`;
    const checks = (params.requiredRelativePaths ?? []).map(
      (relative) =>
        `test -e ${quotePosixPathArg(`${params.remoteDir}/${relative.replace(/^\/+/u, "")}`)}`,
    );
    const command = [
      "set -eu",
      `cleanup_staging() { rm -rf ${quotePosixPathArg(staging)}; }`,
      "trap cleanup_staging EXIT HUP INT TERM",
      `rm -rf ${quotePosixPathArg(staging)}`,
      `mkdir -p ${quotePosixPathArg(staging)} ${quotePosixPathArg(posix.dirname(params.remoteDir))}`,
      `cp -R ${quotePosixPathArg(`${source}/.`)} ${quotePosixPathArg(staging)}`,
      `rm -rf ${quotePosixPathArg(params.remoteDir)}`,
      buildRemoteMoveCommand(staging, params.remoteDir),
      ...checks,
      "cleanup_staging",
      "trap - EXIT HUP INT TERM",
    ].join("\n");
    await waitForClose(await this.backend.exec(command));
  }

  private async ensureComponent(
    id: string,
    required: readonly string[] = [],
    force = false,
  ): Promise<RemoteComponentRef> {
    const existing = (force ? this.forceComponents : this.components).get(id);
    if (existing) {
      const ref = await existing;
      return this.assureRequiredPaths(ref, required);
    }
    const task = this.ensureComponentInternal(id, force);
    this.components.set(id, task);
    if (force) this.forceComponents.set(id, task);
    try {
      const ref = await task;
      return this.assureRequiredPaths(ref, required);
    } catch (error) {
      if (this.components.get(id) === task) this.components.delete(id);
      if (this.forceComponents.get(id) === task) this.forceComponents.delete(id);
      throw error;
    }
  }

  private async assureRequiredPaths(
    ref: RemoteComponentRef,
    required: readonly string[],
  ): Promise<RemoteComponentRef> {
    if (required.length === 0) return ref;
    const missing: string[] = [];
    for (const relative of required) {
      const path = `${ref.componentDir}/${relative.replace(/^\/+/u, "")}`;
      if (!(await this.backend.exists(path))) missing.push(path);
    }
    if (missing.length === 0 || !ref.fromCache) return ref;
    this.loggers.logWarn(
      `[remote-assets] remote component cache incomplete: component=${ref.component.id} missing=${missing.join(",")}; redownloading`,
    );
    await waitForClose(await this.backend.exec(`rm -rf ${quotePosixPathArg(ref.componentDir)}`));
    const task = this.ensureComponentInternal(ref.component.id);
    this.components.set(ref.component.id, task);
    return await task;
  }

  private async ensureComponentInternal(id: string, force = false): Promise<RemoteComponentRef> {
    const manifestRef = await this.manifestPromise;
    const component = selectRemoteAssetManifestComponents(manifestRef.manifest, [id])[0];
    if (!component) {
      throw new Error(`[remote-assets] manifest is missing requested component: ${id}`);
    }
    const cacheSegment = usesRemoteAssetContentAddressedCacheIdentity(component.id)
      ? component.sha256
      : createHash("sha256")
          .update(resolveRemoteAssetComponentCacheVersion(component.version))
          .digest("hex")
          .slice(0, 16);
    const platform = this.options.platformArch.replace(/[^A-Za-z0-9._+-]/gu, "_");
    const safeId = component.id.replace(/[^A-Za-z0-9._+-]/gu, "_");
    const componentDir = `${REMOTE_BASE}/asset-cache/components/${platform}/${safeId}/${cacheSegment}`;
    const ready = `${componentDir}/.ready`;
    const hasReady = await this.backend.exists(ready);
    if (hasReady) {
      if (force) {
        this.loggers.logWarn(
          `[remote-assets] download required: component=${component.id} reason=force refresh path=${ready}`,
        );
        await waitForClose(await this.backend.exec(`rm -rf ${quotePosixPathArg(componentDir)}`));
      } else {
        this.loggers.log(
          `[remote-assets] remote component cache hit: ${component.id}@${component.version}`,
        );
        return { component, componentDir, fromCache: true };
      }
    } else if (!force) {
      this.loggers.logWarn(
        `[remote-assets] download required: component=${component.id} reason=remote component cache missing path=${ready}`,
      );
    }
    const urls = buildComponentArtifactUrlCandidates(
      manifestRef.releaseBaseCandidatesForComponents,
      component.artifactPath,
      this.options.version,
    );
    const totalBytes = await this.findArtifactSize(urls);
    checkCanceled(this.options);
    const staging = `${REMOTE_BASE}/asset-cache/staging/${component.id.replace(/[^A-Za-z0-9._+-]/gu, "_")}-${Date.now()}-${randomUUID()}`;
    const archive = `${staging}/component.tar.gz`;
    const extract = `${staging}/extract`;
    const newDir = `${componentDir}.new-${Date.now()}-${randomUUID()}`;
    const lock = `${componentDir}.lock`;
    const qLock = quotePosixPathArg(lock);
    const qStaging = quotePosixPathArg(staging);
    const qNewDir = quotePosixPathArg(newDir);
    const qReady = quotePosixPathArg(ready);
    const qExtract = quotePosixPathArg(extract);
    const cleanup = `if [ -n "\${lock_heartbeat_pid:-}" ]; then kill "$lock_heartbeat_pid" >/dev/null 2>&1 || true; wait "$lock_heartbeat_pid" 2>/dev/null || true; fi; rm -rf ${qLock} ${qStaging} ${qNewDir}`;
    const download = buildRemoteArtifactDownloadCommand({
      tool: this.tools.download,
      urls,
      outputPath: archive,
      progressLabel: `${component.id}@${component.version}`,
      totalBytes,
      expectedSha256: component.sha256,
      sha256Tool: this.tools.sha256,
    });
    const checksum = buildRemoteChecksumCommand({ tool: this.tools.sha256, filePath: archive });
    const command = [
      "set -eu",
      `rm -rf ${qStaging}`,
      `mkdir -p ${qStaging} ${quotePosixPathArg(posix.dirname(componentDir))}`,
      `while ! mkdir ${qLock} 2>/dev/null; do if [ -e ${qReady} ]; then rm -rf ${qStaging}; exit 0; fi; lock_mtime=$({ stat -c %Y ${qLock} || stat -f %m ${qLock}; } 2>/dev/null || printf 0); lock_now=$(date +%s); if [ "$lock_mtime" -gt 0 ] && [ $((lock_now - lock_mtime)) -ge 600 ]; then echo ${quotePosixShellArg(`[remote-assets] stale lock for ${component.id}@${component.version}, retrying`)} >&2; rm -rf ${qLock}; continue; fi; sleep 1; done`,
      `lock_heartbeat_pid=; (while :; do touch ${qLock} 2>/dev/null || exit 0; sleep 30; done) & lock_heartbeat_pid=$!`,
      `trap ${quotePosixShellArg(cleanup)} EXIT`,
      `if [ -e ${qReady} ]; then exit 0; fi`,
      download,
      `actual_sha=$(${checksum})`,
      `if [ "$actual_sha" != ${quotePosixShellArg(component.sha256)} ]; then echo ${quotePosixShellArg(`[remote-assets] sha256 mismatch for ${component.id}@${component.version}`)} >&2; exit 1; fi`,
      `mkdir -p ${qExtract}`,
      `${this.tools.tar} -xzf ${quotePosixPathArg(archive)} -C ${qExtract}`,
      `test "$(find ${qExtract} -mindepth 1 -maxdepth 1 | head -n 1)"`,
      `printf ready > ${quotePosixPathArg(`${extract}/.ready`)}`,
      `rm -rf ${qNewDir}`,
      buildRemoteMoveCommand(extract, newDir),
      `rm -rf ${quotePosixPathArg(componentDir)}`,
      buildRemoteMoveCommand(newDir, componentDir),
      cleanup,
      "trap - EXIT",
    ].join(" && ");
    this.loggers.log(`[remote-assets] remote downloading ${component.id}@${component.version}`);
    const stream = await this.backend.exec(command);
    forwardDownloadProgress(stream, this.loggers);
    await waitForClose(stream);
    return { component, componentDir, fromCache: false };
  }

  private async findArtifactSize(urls: string[]): Promise<number | null> {
    const fetch = resolveRemoteAssetFetch(this.options.remoteAssetNetwork);
    for (const url of urls) {
      try {
        const response = await fetch(url, { method: "HEAD" });
        if (!response.ok) continue;
        const header = response.headers.get("content-length");
        if (!header) continue;
        const bytes = Number.parseInt(header, 10);
        if (Number.isFinite(bytes) && bytes > 0) return bytes;
      } catch {
        // 进度大小探测失败仍继续后续候选地址。
      }
    }
    return null;
  }
}

const manifestFlights = new Map<string, Promise<RemoteManifestRef>>();

export async function fetchRemoteDownloadManifest(
  options: RemoteDownloadAssetInstallerOptions,
  loggers: DeployLoggers,
): Promise<RemoteManifestRef> {
  const bases = resolveRemoteCdnBaseUrls({
    remoteCdnBaseUrl: options.remoteCdnBaseUrl,
    remoteCdnBaseUrls: options.remoteCdnBaseUrls,
  });
  const key = [
    options.version,
    options.platformArch,
    String(options.manifestRequestTimeoutMs ?? "default"),
    ...bases,
  ].join("::");
  const existing = manifestFlights.get(key);
  if (existing) return existing;
  const task = fetchManifestCandidates(options, loggers, bases).finally(() => {
    if (manifestFlights.get(key) === task) manifestFlights.delete(key);
  });
  manifestFlights.set(key, task);
  return task;
}

async function fetchManifestCandidates(
  options: RemoteDownloadAssetInstallerOptions,
  loggers: DeployLoggers,
  bases: string[],
): Promise<RemoteManifestRef> {
  const releaseBases = buildReleaseBaseCandidates(bases, options.version);
  const files = buildRemoteAssetManifestFileCandidates(options.platformArch);
  const urls = buildReleaseAssetUrlCandidates(releaseBases, files);
  const errors: string[] = [];
  for (const url of urls) {
    loggers.log(`[remote-assets] downloading manifest ${url}`);
    const signal = createRemoteAssetManifestRequestSignal(options.manifestRequestTimeoutMs);
    let response: Response;
    try {
      response = await resolveRemoteAssetFetch(options.remoteAssetNetwork)(url, { signal });
    } catch (error) {
      errors.push(`${url} -> ${String(error)}`);
      loggers.logWarn(`[remote-assets] manifest candidate failed ${url}: ${String(error)}`);
      continue;
    }
    if (!response.ok) {
      if (response.status !== 404) errors.push(`${url} -> HTTP ${response.status}`);
      continue;
    }
    let manifest: RemoteAssetManifestRef["manifest"];
    try {
      manifest = await parseRemoteAssetManifestFromResponse(
        response,
        url,
        options.version,
        options.platformArch,
      );
    } catch (error) {
      if (!signal.aborted) throw error;
      loggers.logWarn(`[remote-assets] manifest candidate failed ${url}: ${String(error)}`);
      errors.push(`${url} -> ${String(error)}`);
      continue;
    }
    const matched =
      releaseBases
        .map((base) => base.replace(/\/+$/u, ""))
        .filter((base) => base.length > 0 && url.startsWith(`${base}/`))
        .sort((left, right) => right.length - left.length)[0] ?? null;
    const releaseBaseCandidatesForComponents = matched
      ? [matched, ...releaseBases.filter((base) => base !== matched)]
      : releaseBases;
    return { manifest, releaseBaseCandidatesForComponents };
  }
  if (errors.length > 0) {
    throw new Error(
      `[remote-assets] failed to fetch manifest for ${options.platformArch}: ${errors.join("; ")}`,
    );
  }
  throw new Error(`[remote-assets] manifest not found for ${options.platformArch}`);
}

export function buildRemoteChecksumCommand(params: {
  tool: RemoteSha256Tool;
  filePath: string;
}): string {
  const file = quotePosixPathArg(params.filePath);
  if (params.tool === "sha256sum") return `sha256sum ${file} | awk '{print $1}'`;
  if (params.tool === "shasum") return `shasum -a 256 ${file} | awk '{print $1}'`;
  return `openssl dgst -sha256 ${file} | awk '{print $NF}'`;
}

export function buildRemoteArtifactDownloadCommand(params: {
  tool: RemoteDownloadTool;
  urls: string[];
  outputPath: string;
  progressLabel: string;
  totalBytes?: number | null;
  expectedSha256?: string;
  sha256Tool?: RemoteSha256Tool;
}): string {
  const verify =
    typeof params.expectedSha256 === "string" &&
    params.expectedSha256.length > 0 &&
    typeof params.sha256Tool === "string";
  const attempts = params.urls.map((url) => {
    const output = quotePosixPathArg(params.outputPath);
    const download =
      params.tool === "curl"
        ? `curl -fL --retry 2 --connect-timeout 20 -o ${output} ${quotePosixPathArg(url)}`
        : `wget --tries=3 --timeout=20 -O ${output} ${quotePosixPathArg(url)}`;
    if (!verify) return `(${download})`;
    const checksum = buildRemoteChecksumCommand({
      tool: params.sha256Tool as RemoteSha256Tool,
      filePath: params.outputPath,
    });
    const verifiedOutput = quotePosixPathArg(params.outputPath);
    const expected = quotePosixShellArg(params.expectedSha256 as string);
    const mismatch = quotePosixShellArg(
      `[remote-assets] sha256 mismatch for ${params.progressLabel}: expected=${params.expectedSha256}, actual=`,
    );
    return `(${[
      `rm -f ${verifiedOutput}`,
      download,
      `actual_sha=$(${checksum})`,
      `if [ "$actual_sha" = ${expected} ]; then true; else echo ${mismatch}"$actual_sha" >&2; false; fi`,
    ].join(" && ")})`;
  });
  const output = quotePosixPathArg(params.outputPath);
  const label = quotePosixShellArg(params.progressLabel);
  const floored =
    typeof params.totalBytes === "number" && Number.isFinite(params.totalBytes)
      ? Math.floor(params.totalBytes)
      : null;
  const total = floored !== null && floored > 0 ? floored : null;
  const printer =
    total !== null
      ? `awk -v label=${label} -v bytes="$progress_size" -v total=${total} -v elapsed="$progress_elapsed" 'BEGIN { transferred = bytes / 1048576; total_mb = total / 1048576; speed = transferred / elapsed; percent = bytes / total * 100; if (percent > 100) percent = 100; printf "download progress: [%s] %.1f%% (%.1f/%.1f MB, %.2f MB/s)\\n", label, percent, transferred, total_mb, speed; fflush(); }'`
      : `awk -v label=${label} -v bytes="$progress_size" -v elapsed="$progress_elapsed" 'BEGIN { transferred = bytes / 1048576; speed = transferred / elapsed; printf "download progress: [%s] %.1f MB (total unknown, %.2f MB/s)\\n", label, transferred, speed; fflush(); }'`;
  const update = `if [ -f ${output} ]; then progress_size=$(wc -c < ${output} 2>/dev/null || printf 0); else progress_size=0; fi; progress_now=$(date +%s); progress_elapsed=$((progress_now - progress_started_at)); if [ "$progress_elapsed" -le 0 ]; then progress_elapsed=1; fi`;
  const loop = `progress_started_at=$(date +%s); progress_pid=; (last_progress_size=-1; while :; do ${update}; if [ "$progress_size" != "$last_progress_size" ]; then ${printer}; last_progress_size="$progress_size"; fi; sleep 1; done) & progress_pid=$!`;
  const stop = `if [ -n "$progress_pid" ]; then kill "$progress_pid" >/dev/null 2>&1 || true; wait "$progress_pid" 2>/dev/null || true; fi; if [ -f ${output} ]; then ${update}; ${printer}; fi`;
  return `set +e; ${loop}; ${attempts.join(" || ")}; download_status=$?; set -e; ${stop}; test "$download_status" -eq 0`;
}

function forwardDownloadProgress(stream: StdioStream, loggers: DeployLoggers): void {
  let buffered = "";
  stream.stdout.on("data", (chunk: Buffer | string) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/u);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^download progress:/iu.test(trimmed)) loggers.log(trimmed);
    }
  });
  stream.onClose(() => {
    const trimmed = buffered.trim();
    if (/^download progress:/iu.test(trimmed)) loggers.log(trimmed);
  });
}
