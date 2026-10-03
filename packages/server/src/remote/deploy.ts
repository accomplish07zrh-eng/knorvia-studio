/* eslint-disable max-lines -- Deployment lifecycle, admission, and memo state have one owner. */
import { join } from "node:path";
import {
  KNORVIA_VERSION,
  formatLogPrefix,
  normalizeRemoteResourcePackageSelection,
  type RemoteAssetInstallMode,
  type RemoteResourcePackageId,
  type RemoteResourcePackageSelection,
} from "@knorvia/shared";
import type { IRemoteBackend, RemoteEnvironment } from "./backend.js";
import { deployKnorviaAgentRuntime } from "./agentDeploy.js";
import { REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS } from "@knorvia/server/remote/agentOfficialPluginAssets.js";
import {
  createRemoteComponentVersionResolver,
  deployNodePtyPrebuilds,
  deployNodeRuntime,
  logDeployRequired,
} from "@knorvia/server/remote/remoteAssetDeployDecision.js";
import {
  REMOTE_BASE,
  fileExists,
  formatOptionalValue,
  formatOptionalValues,
  type DeployLoggers,
  type RemoteAssetDeployOptions,
} from "@knorvia/server/remote/deployShared.js";
import { quotePosixPathArg } from "@knorvia/server/remote/posixShell.js";
import { checkServerBundleRequiredMarkers } from "@knorvia/server/remote/serverBundleDeployCheck.js";
import { deployRuntimeTools } from "@knorvia/server/remote/runtimeToolDeploy.js";
import {
  ensureRemoteReleaseDirFromCdn,
  selectRemoteAssetManifestComponents,
  type RemoteAssetManifestRef,
} from "@knorvia/server/remote/remoteAssetCache.js";
import {
  fetchRemoteDownloadManifest,
  LocalUploadAssetInstaller,
  RemoteDownloadAssetInstaller,
  type RemoteAssetInstaller,
} from "@knorvia/server/remote/remoteAssetInstaller.js";
import {
  checkRemoteAssetComponentIdentity,
  createFreshRemoteAssetManifestRefResolver,
  hasRemoteAssetComponentRefreshPending,
  markRemoteAssetComponentRefreshPending,
  writeRemoteAssetComponentMeta,
} from "@knorvia/server/remote/remoteAssetLiveIdentity.js";
import { detectRemoteAssetTools } from "@knorvia/server/remote/remoteAssetPreflight.js";
import { assertSupportedRemoteEnvironment } from "@knorvia/server/remote/remotePlatformSupport.js";
import { acquireRemoteDeployLock } from "@knorvia/server/remote/remoteDeployLock.js";
import type { RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";

export type DeployLockMode = "remote" | "caller-serialized";

export interface DeployOptions {
  signal?: AbortSignal;
  mockCdnDir?: string;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  manifestRequestTimeoutMs?: number;
  remoteAssetNetwork?: RemoteAssetNetworkPort;
  force?: boolean;
  deployLockAcquireTimeoutMs?: number;
  deployLockMode?: DeployLockMode;
  assetInstallMode?: RemoteAssetInstallMode;
  resourcePackages?: RemoteResourcePackageSelection;
}

type ServerDeployDecision =
  | { shouldDeploy: false }
  | { shouldDeploy: true; reason: string; appVersionChanged?: boolean };

type InstallerOptions = RemoteAssetDeployOptions & {
  platformArch: string;
  version: string;
  assetInstallMode?: RemoteAssetInstallMode;
};

type DownloadManifestRef = Awaited<ReturnType<typeof fetchRemoteDownloadManifest>>;

const log = (...args: unknown[]): void => {
  console.log(formatLogPrefix("deploy", process.pid), ...args);
};
const logWarn = (...args: unknown[]): void => {
  console.warn(formatLogPrefix("deploy", process.pid), ...args);
};

function createRemoteAssetInstaller(
  backend: IRemoteBackend,
  options: InstallerOptions,
  loggers: DeployLoggers,
  pinnedManifestGetter?: () => Promise<DownloadManifestRef>,
): RemoteAssetInstaller {
  if (options.assetInstallMode !== "remote-download") {
    return new LocalUploadAssetInstaller(backend, options, loggers);
  }

  let manifestPromise: Promise<DownloadManifestRef> | undefined;
  let installerPromise: Promise<RemoteDownloadAssetInstaller> | undefined;
  const getManifest = (): Promise<DownloadManifestRef> => {
    if (pinnedManifestGetter) return pinnedManifestGetter();
    manifestPromise ??= fetchRemoteDownloadManifest(options, loggers);
    return manifestPromise;
  };
  const getInstaller = async (): Promise<RemoteDownloadAssetInstaller> => {
    installerPromise ??= detectRemoteAssetTools(backend, loggers).then(
      (tools) => new RemoteDownloadAssetInstaller(backend, options, tools, loggers, getManifest()),
    );
    return installerPromise;
  };

  return {
    mode: "remote-download",
    async resolveComponentVersion(componentId) {
      const ref = await getManifest();
      return selectRemoteAssetManifestComponents(ref.manifest, [componentId])[0]?.version ?? null;
    },
    async resolveComponentSha256(componentId) {
      const ref = await getManifest();
      return selectRemoteAssetManifestComponents(ref.manifest, [componentId])[0]?.sha256 ?? null;
    },
    async installFile(params) {
      const installer = await getInstaller();
      await installer.installFile(params);
    },
    async installDirectory(params) {
      const installer = await getInstaller();
      await installer.installDirectory(params);
    },
  };
}

function hasRemoteAssetFallback(options?: DeployOptions): boolean {
  const cache = options?.remoteCacheDir?.trim();
  const singleBase = options?.remoteCdnBaseUrl?.trim();
  const arrayBase = options?.remoteCdnBaseUrls?.some((baseUrl) => baseUrl.trim().length > 0);
  return Boolean(cache && (singleBase || arrayBase));
}

function resolveMockReleaseDir(mockCdnDir?: string): string | null {
  return mockCdnDir ? join(mockCdnDir, "releases", KNORVIA_VERSION) : null;
}

function requiredMockPaths(platformArch: string, componentIds?: string[]): string[] {
  const paths = new Set<string>();
  const components = componentIds?.length ? componentIds : ["server-bundle", "node-runtime"];
  for (const componentId of components) {
    switch (componentId) {
      case "server-bundle":
        paths.add("server/knorvia-server.cjs");
        break;
      case "node-runtime":
        paths.add(`node/${platformArch}/node`);
        break;
      case "node-pty":
        paths.add(`node-pty/${platformArch}/pty.node`);
        if (platformArch.startsWith("darwin-")) paths.add(`node-pty/${platformArch}/spawn-helper`);
        break;
      case "knorvia":
        paths.add(`knorvia/${platformArch}/knorvia.cjs`);
        for (const path of REMOTE_AGENT_OFFICIAL_PLUGIN_REQUIRED_RELATIVE_PATHS) {
          paths.add(`knorvia/${platformArch}/packages/${path}`);
        }
        break;
      case "bfs":
        paths.add(`tools/${platformArch}/bfs/bfs`);
        break;
      case "ripgrep":
        paths.add(`tools/${platformArch}/ripgrep/rg`);
        break;
      case "ugrep":
        paths.add(`tools/${platformArch}/ugrep/ugrep`);
        break;
    }
  }
  return [...paths];
}

async function findMissingMockPaths(
  releaseDir: string,
  platformArch: string,
  componentIds?: string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const relativePath of requiredMockPaths(platformArch, componentIds)) {
    if (!(await fileExists(releaseDir, ...relativePath.split("/")))) missing.push(relativePath);
  }
  return missing;
}

async function resolveReleaseDir(
  options: DeployOptions | undefined,
  env: RemoteEnvironment,
  loggers: DeployLoggers,
  componentIds: string[] | undefined,
  manifestRef: RemoteAssetManifestRef | null,
  forceRefresh: boolean,
): Promise<string | null> {
  const mockReleaseDir = resolveMockReleaseDir(options?.mockCdnDir);
  const platformArch = `${env.platform}-${env.arch}`;
  if (mockReleaseDir) {
    const missing = await findMissingMockPaths(mockReleaseDir, platformArch, componentIds);
    if (missing.length === 0) return mockReleaseDir;
    loggers.logWarn(
      `[remote-assets] mock-cdn incomplete for ${platformArch}; missing=${missing.join(", ")}`,
    );
    if (!hasRemoteAssetFallback(options)) return mockReleaseDir;
    loggers.logWarn(
      `[remote-assets] fallback to CDN/cache for ${platformArch}; components=${componentIds?.join(",") ?? "<all>"}`,
    );
  }
  return await ensureRemoteReleaseDirFromCdn(
    {
      remoteCdnBaseUrl: options?.remoteCdnBaseUrl,
      remoteCdnBaseUrls: options?.remoteCdnBaseUrls,
      remoteCacheDir: options?.remoteCacheDir,
      version: KNORVIA_VERSION,
      platformArch,
      componentIds,
      manifestRef,
      forceRefresh,
      manifestRequestTimeoutMs: options?.manifestRequestTimeoutMs,
      remoteAssetNetwork: options?.remoteAssetNetwork,
    },
    loggers,
  );
}

async function checkServerDeployDecision(
  backend: IRemoteBackend,
  options: { platformArch: string; expectedSha256: string | null },
  loggers: DeployLoggers,
): Promise<ServerDeployDecision> {
  const nodePath = `${REMOTE_BASE}/node`;
  const serverPath = `${REMOTE_BASE}/knorvia-server.cjs`;
  try {
    loggers.log("checking if deploy needed...");
    const nodeExists = await backend.exists(nodePath);
    loggers.log("remote node exists:", nodeExists);
    if (!nodeExists) return { shouldDeploy: true, reason: `remote file missing path=${nodePath}` };
    const serverExists = await backend.exists(serverPath);
    loggers.log("remote server exists:", serverExists);
    if (!serverExists)
      return { shouldDeploy: true, reason: `remote file missing path=${serverPath}` };
    loggers.log("checking remote version...");
    const stream = await backend.exec(
      `${quotePosixPathArg(nodePath)} ${quotePosixPathArg(serverPath)} --version`,
    );
    const versionOutput = await new Promise<string>((resolve) => {
      let output = "";
      stream.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      stream.onClose(() => resolve(output));
    });
    const remoteVersion = versionOutput.trim();
    loggers.log("remote version:", JSON.stringify(remoteVersion), "local:", KNORVIA_VERSION);
    if (remoteVersion !== KNORVIA_VERSION) {
      return {
        shouldDeploy: true,
        reason: `remote server version mismatch remote=${remoteVersion} expected=${KNORVIA_VERSION}`,
        appVersionChanged: true,
      };
    }
    const markers = await checkServerBundleRequiredMarkers(backend, nodePath, serverPath);
    if (markers.shouldDeploy) return markers;
    if (options.expectedSha256) {
      const identity = await checkRemoteAssetComponentIdentity(backend, {
        componentId: "server-bundle",
        platformArch: options.platformArch,
        expectedIdentity: { sha256: options.expectedSha256 },
      });
      if (identity.shouldDeploy) return identity;
    }
    return { shouldDeploy: false };
  } catch (error) {
    loggers.log("checkServerDeployDecision error (will deploy):", error);
    return { shouldDeploy: true, reason: `remote deploy check failed: ${String(error)}` };
  }
}

export async function deployServer(
  backend: IRemoteBackend,
  env: RemoteEnvironment,
  options?: DeployOptions,
): Promise<boolean> {
  const platformArch = `${env.platform}-${env.arch}`;
  assertSupportedRemoteEnvironment(env);
  const selectedResourcePackageIds = normalizeRemoteResourcePackageSelection();
  const isSelected = (id: RemoteResourcePackageId): boolean =>
    selectedResourcePackageIds.includes(id);
  const loggers: DeployLoggers = { log, logWarn };
  const componentOptions = {
    mockCdnDir: options?.mockCdnDir,
    remoteCdnBaseUrl: options?.remoteCdnBaseUrl,
    remoteCdnBaseUrls: options?.remoteCdnBaseUrls,
    remoteCacheDir: options?.remoteCacheDir,
    manifestRequestTimeoutMs: options?.manifestRequestTimeoutMs,
    remoteAssetNetwork: options?.remoteAssetNetwork,
  };
  const freshManifest = createFreshRemoteAssetManifestRefResolver(componentOptions, env, loggers);
  const freshFallbackManifest = createFreshRemoteAssetManifestRefResolver(
    { ...componentOptions, mockCdnDir: undefined },
    env,
    loggers,
  );
  let remoteManifestPromise: Promise<DownloadManifestRef> | undefined;
  let localManifestPromise: Promise<RemoteAssetManifestRef | null> | undefined;
  const remoteManifest = (): Promise<DownloadManifestRef> => {
    remoteManifestPromise ??= fetchRemoteDownloadManifest(
      {
        version: KNORVIA_VERSION,
        platformArch,
        remoteCdnBaseUrl: options?.remoteCdnBaseUrl,
        remoteCdnBaseUrls: options?.remoteCdnBaseUrls,
        manifestRequestTimeoutMs: options?.manifestRequestTimeoutMs,
        remoteAssetNetwork: options?.remoteAssetNetwork,
      },
      loggers,
    );
    return remoteManifestPromise;
  };
  const localManifest = (): Promise<RemoteAssetManifestRef | null> => {
    localManifestPromise ??= freshManifest();
    return localManifestPromise;
  };
  const manifestForComponents = async (
    componentIds?: string[],
  ): Promise<RemoteAssetManifestRef | null> => {
    if (options?.assetInstallMode === "remote-download") return remoteManifest();
    const mockReleaseDir = resolveMockReleaseDir(options?.mockCdnDir);
    if (!mockReleaseDir) return localManifest();
    const missing = await findMissingMockPaths(mockReleaseDir, platformArch, componentIds);
    if (missing.length > 0 && hasRemoteAssetFallback(options)) return freshFallbackManifest();
    return localManifest();
  };
  const releaseDirs = new Map<string, string | null>();
  const getReleaseDir = async (
    componentIds?: string[],
    resolutionOptions?: { forceRefresh?: boolean },
  ): Promise<string | null> => {
    const forceRefresh = Boolean(resolutionOptions?.forceRefresh);
    const componentsKey = componentIds?.length ? [...componentIds].sort().join(",") : "<all>";
    const key = `${componentsKey}:${forceRefresh ? "force" : "reuse"}`;
    if (releaseDirs.has(key)) return releaseDirs.get(key) ?? null;
    const releaseDir = await resolveReleaseDir(
      options,
      env,
      loggers,
      componentIds,
      await manifestForComponents(componentIds),
      forceRefresh,
    );
    releaseDirs.set(key, releaseDir);
    loggers.log(
      "releaseDir:",
      releaseDir ?? "<missing>",
      "components:",
      componentIds?.join(",") ?? "<all>",
    );
    return releaseDir;
  };
  const getSha256 = async (componentId: string): Promise<string | null> => {
    const ref = await manifestForComponents([componentId]);
    return ref
      ? (selectRemoteAssetManifestComponents(ref.manifest, [componentId])[0]?.sha256 ?? null)
      : null;
  };
  const assetOptions: RemoteAssetDeployOptions = {
    signal: options?.signal,
    resolveReleaseDir: getReleaseDir,
    resolveComponentSha256: getSha256,
    remoteCdnBaseUrl: options?.remoteCdnBaseUrl,
    remoteCdnBaseUrls: options?.remoteCdnBaseUrls,
    remoteCacheDir: options?.remoteCacheDir,
    manifestRequestTimeoutMs: options?.manifestRequestTimeoutMs,
    remoteAssetNetwork: options?.remoteAssetNetwork,
  };
  const componentVersion = createRemoteComponentVersionResolver(componentOptions, env, loggers);
  const installer = createRemoteAssetInstaller(
    backend,
    {
      ...assetOptions,
      platformArch,
      version: KNORVIA_VERSION,
      assetInstallMode: options?.assetInstallMode,
    },
    loggers,
    options?.assetInstallMode === "remote-download" ? remoteManifest : undefined,
  );
  const expectedVersion = async (componentId: string): Promise<string | null> => {
    if (installer.resolveComponentVersion) {
      const version = await installer.resolveComponentVersion(componentId);
      if (version) return version;
    }
    return componentVersion(componentId);
  };

  loggers.log("mockCdnDir:", options?.mockCdnDir ?? "<missing>");
  loggers.log("remoteCdnBaseUrl:", formatOptionalValue(options?.remoteCdnBaseUrl));
  loggers.log("remoteCdnBaseUrls:", formatOptionalValues(options?.remoteCdnBaseUrls));
  loggers.log("remoteCacheDir:", formatOptionalValue(options?.remoteCacheDir));
  loggers.log("remote env:", platformArch);
  loggers.log("selected remote resource packages:", selectedResourcePackageIds.join(","));

  const deployWithDecision = async (
    decision: ServerDeployDecision,
    serverSha256: string | null,
  ): Promise<boolean> => {
    const pending = await hasRemoteAssetComponentRefreshPending(backend, {
      componentId: "knorvia",
      platformArch,
    });
    const shouldForceRefresh =
      Boolean(options?.force) ||
      pending ||
      (decision.shouldDeploy && decision.appVersionChanged === true);
    if (shouldForceRefresh) {
      await markRemoteAssetComponentRefreshPending(backend, {
        componentId: "knorvia",
        platformArch,
        appVersion: KNORVIA_VERSION,
      });
    }
    const shouldDeploy = decision.shouldDeploy;
    if (!shouldDeploy) {
      loggers.log("skipped — remote version matches");
      if (isSelected("node-pty")) {
        await deployNodePtyPrebuilds(
          backend,
          env,
          { ...assetOptions, platformArch, onlyIfMissing: true, installer },
          loggers,
        );
      }
    } else {
      await deployNodeRuntime(
        backend,
        {
          ...assetOptions,
          platformArch,
          force: Boolean(options?.force),
          installer,
          expectedVersion: await expectedVersion("node-runtime"),
        },
        loggers,
      );
      logDeployRequired({
        loggers: { logWarn: loggers.logWarn },
        installer,
        componentId: "server-bundle",
        reason: decision.reason,
      });
      await installer.installFile({
        componentId: "server-bundle",
        sourceRelativePath: "server/knorvia-server.cjs",
        remotePath: `${REMOTE_BASE}/knorvia-server.cjs`,
        forceRefresh: shouldForceRefresh,
      });
      if (serverSha256) {
        await writeRemoteAssetComponentMeta(backend, {
          id: "server-bundle",
          sha256: serverSha256,
          platformArch,
        });
      }
      loggers.log("server install done");
      if (isSelected("node-pty")) {
        await deployNodePtyPrebuilds(
          backend,
          env,
          {
            ...assetOptions,
            platformArch,
            force: Boolean(options?.force),
            onlyIfMissing: false,
            installer,
            expectedVersion: await expectedVersion("node-pty"),
          },
          loggers,
        );
      }
      loggers.log("all uploads complete");
    }
    await deployKnorviaAgentRuntime(
      backend,
      env,
      {
        ...assetOptions,
        platformArch,
        installer,
        force: shouldForceRefresh,
        selectedResourcePackageIds,
      },
      loggers,
    );
    await deployRuntimeTools(
      backend,
      env,
      { ...assetOptions, platformArch, installer, selectedResourcePackageIds },
      loggers,
    );
    return shouldDeploy;
  };
  const deployCurrentState = async (): Promise<boolean> => {
    const serverSha256 = await getSha256("server-bundle");
    const decision: ServerDeployDecision = options?.force
      ? { shouldDeploy: true, reason: "force deploy requested" }
      : await checkServerDeployDecision(
          backend,
          { platformArch, expectedSha256: serverSha256 },
          loggers,
        );
    return deployWithDecision(decision, serverSha256);
  };

  if (options?.deployLockMode === "caller-serialized") return deployCurrentState();
  const preLockDecision: ServerDeployDecision = options?.force
    ? { shouldDeploy: true, reason: "force deploy requested" }
    : await checkServerDeployDecision(backend, { platformArch, expectedSha256: null }, loggers);
  if (preLockDecision.shouldDeploy) {
    loggers.log(`waiting for install-root lock: ${preLockDecision.reason}`);
  }
  const lock = await acquireRemoteDeployLock(backend, {
    acquireTimeoutMs: options?.deployLockAcquireTimeoutMs,
  });
  let result = false;
  let deployFailed = false;
  let deployError: unknown;
  try {
    result = await deployCurrentState();
  } catch (error) {
    deployFailed = true;
    deployError = error;
  }
  let releaseFailed = false;
  let releaseError: unknown;
  try {
    await lock.release();
  } catch (error) {
    releaseFailed = true;
    releaseError = error;
  }
  if (deployFailed && releaseFailed) {
    throw new AggregateError(
      [deployError, releaseError],
      "remote deployment and deploy-lock release both failed",
    );
  }
  if (deployFailed) throw deployError;
  if (releaseFailed) throw releaseError;
  return result;
}
