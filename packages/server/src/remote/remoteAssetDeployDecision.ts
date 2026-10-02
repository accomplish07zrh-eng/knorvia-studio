import { KNORVIA_VERSION } from "@knorvia/shared";
import type { IRemoteBackend, RemoteEnvironment } from "@knorvia/server/remote/backend.js";
import {
  REMOTE_BASE,
  type DeployLoggers,
  type RemoteAssetDeployOptions,
} from "@knorvia/server/remote/deployShared.js";
import {
  fetchRemoteAssetManifestFromCdn,
  resolveRemoteAssetComponentCacheVersion,
  selectRemoteAssetManifestComponents,
  type RemoteAssetManifest,
} from "@knorvia/server/remote/remoteAssetCache.js";
import {
  LocalUploadAssetInstaller,
  type RemoteAssetInstaller,
} from "@knorvia/server/remote/remoteAssetInstaller.js";
import {
  readRemoteAssetComponentMeta,
  writeRemoteAssetComponentMeta,
} from "@knorvia/server/remote/remoteAssetLiveIdentity.js";
import type { RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";

export interface RemoteAssetVersionResolverOptions {
  mockCdnDir?: string;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  manifestRequestTimeoutMs?: number;
  remoteAssetNetwork?: RemoteAssetNetworkPort;
}

interface DeployNodeRuntimeOptions extends RemoteAssetDeployOptions {
  platformArch: string;
  force?: boolean;
  installer: RemoteAssetInstaller;
  expectedVersion?: string | null;
}

interface DeployNodePtyPrebuildOptions extends DeployNodeRuntimeOptions {
  onlyIfMissing: boolean;
}

type ComponentDeployDecision = { shouldDeploy: false } | { shouldDeploy: true; reason: string };

interface ComponentDeployDecisionOptions {
  componentId: string;
  platformArch: string;
  remotePath: string;
  expectedVersion: string | null;
  force?: boolean;
  fallbackDeployWhenVersionUnknown: boolean;
}

const NODE_RUNTIME_COMPONENT = "node-runtime";
const NODE_PTY_COMPONENT = "node-pty";
const NODE_RUNTIME_PATH = `${REMOTE_BASE}/node`;
const NODE_PTY_PATH = `${REMOTE_BASE}/build/Release/pty.node`;
const SPAWN_HELPER_PATH = `${REMOTE_BASE}/build/Release/spawn-helper`;
const PREPARE_PREBUILDS_HINT =
  "Run: node scripts/prepare-prebuilds.mjs to prepare mock-cdn release assets.";

export function createRemoteComponentVersionResolver(
  options: RemoteAssetVersionResolverOptions,
  env: RemoteEnvironment,
  loggers: DeployLoggers,
): (componentId: string) => Promise<string | null> {
  let pinnedManifest: Promise<RemoteAssetManifest | null> | undefined;

  async function requestManifest(): Promise<RemoteAssetManifest | null> {
    if (options.mockCdnDir) {
      return null;
    }
    try {
      return await fetchRemoteAssetManifestFromCdn(
        {
          remoteCdnBaseUrl: options.remoteCdnBaseUrl,
          remoteCdnBaseUrls: options.remoteCdnBaseUrls,
          remoteCacheDir: options.remoteCacheDir,
          version: KNORVIA_VERSION,
          platformArch: `${env.platform}-${env.arch}`,
          manifestRequestTimeoutMs: options.manifestRequestTimeoutMs,
          remoteAssetNetwork: options.remoteAssetNetwork,
        },
        loggers,
      );
    } catch (error) {
      loggers.logWarn(`[remote-assets] component manifest request failed: ${String(error)}`);
      throw error;
    }
  }

  return async (componentId) => {
    const manifest = await (pinnedManifest ??= requestManifest());
    if (!manifest) {
      return null;
    }
    const version = selectRemoteAssetManifestComponents(manifest, [componentId])[0]?.version;
    return version ? resolveRemoteAssetComponentCacheVersion(version) : null;
  };
}

function normalizeVersion(version: string | null | undefined): string | null {
  return version ? resolveRemoteAssetComponentCacheVersion(version) : null;
}

async function decideComponentDeployment(
  backend: IRemoteBackend,
  options: ComponentDeployDecisionOptions,
): Promise<ComponentDeployDecision> {
  const { componentId, platformArch, remotePath, expectedVersion } = options;
  if (options.force) {
    return { shouldDeploy: true, reason: "force deploy requested" };
  }
  if (!(await backend.exists(remotePath))) {
    return { shouldDeploy: true, reason: `remote file missing path=${remotePath}` };
  }
  if (!expectedVersion) {
    return options.fallbackDeployWhenVersionUnknown
      ? {
          shouldDeploy: true,
          reason: "component version unavailable, using legacy full deploy",
        }
      : { shouldDeploy: false };
  }

  const remoteMeta = await readRemoteAssetComponentMeta(backend, componentId);
  let reason: string;
  if (!remoteMeta) {
    reason = `remote component meta missing expected=${expectedVersion}`;
  } else if (remoteMeta.id !== componentId) {
    reason = `remote component id mismatch remote=${remoteMeta.id} expected=${componentId}`;
  } else if (remoteMeta.platformArch !== platformArch) {
    reason = `remote platform mismatch remote=${remoteMeta.platformArch} expected=${platformArch}`;
  } else if (normalizeVersion(remoteMeta.version) !== normalizeVersion(expectedVersion)) {
    reason = `remote version mismatch remote=${remoteMeta.version} expected=${expectedVersion}`;
  } else {
    return { shouldDeploy: false };
  }
  return { shouldDeploy: true, reason };
}

export function logDeployRequired(options: {
  loggers: Pick<DeployLoggers, "logWarn">;
  installer: RemoteAssetInstaller;
  componentId: string;
  reason: string;
}): void {
  const action =
    options.installer.mode === "remote-download" ? "download required" : "upload required";
  options.loggers.logWarn(
    `[remote-assets] ${action}: component=${options.componentId} reason=${options.reason}`,
  );
}

export async function deployNodeRuntime(
  backend: IRemoteBackend,
  options: DeployNodeRuntimeOptions,
  loggers: DeployLoggers,
): Promise<void> {
  const platformArch = options.platformArch;
  const installer = options.installer;
  const expectedVersion = normalizeVersion(options.expectedVersion);
  const decision = await decideComponentDeployment(backend, {
    componentId: NODE_RUNTIME_COMPONENT,
    platformArch,
    remotePath: NODE_RUNTIME_PATH,
    expectedVersion,
    force: options.force,
    fallbackDeployWhenVersionUnknown: true,
  });
  if (!decision.shouldDeploy) {
    loggers.log("node runtime already matches, skip");
    return;
  }

  logDeployRequired({
    loggers,
    installer,
    componentId: NODE_RUNTIME_COMPONENT,
    reason: decision.reason,
  });
  await installer.installFile({
    componentId: NODE_RUNTIME_COMPONENT,
    sourceRelativePath: `node/${platformArch}/node`,
    remotePath: NODE_RUNTIME_PATH,
    executable: true,
  });
  await writeRemoteAssetComponentMeta(backend, {
    id: NODE_RUNTIME_COMPONENT,
    version: expectedVersion ?? "unknown",
    platformArch,
  });
  loggers.log("node install done");
}

export async function deployNodePtyPrebuilds(
  backend: IRemoteBackend,
  env: RemoteEnvironment,
  options: DeployNodePtyPrebuildOptions,
  loggers: DeployLoggers,
): Promise<void> {
  const platformArch = options.platformArch;
  const onlyIfMissing = options.onlyIfMissing;
  const installer = options.installer;
  const expectedVersion = normalizeVersion(options.expectedVersion);
  const decision = await decideComponentDeployment(backend, {
    componentId: NODE_PTY_COMPONENT,
    platformArch,
    remotePath: NODE_PTY_PATH,
    expectedVersion,
    force: options.force,
    fallbackDeployWhenVersionUnknown: !onlyIfMissing,
  });

  if (decision.shouldDeploy) {
    const sourceRelativePath = `node-pty/${platformArch}/pty.node`;
    if (
      installer instanceof LocalUploadAssetInstaller &&
      !(await installer.tryResolveLocalPath([NODE_PTY_COMPONENT], sourceRelativePath))
    ) {
      loggers.logWarn(`WARNING: no node-pty prebuild for ${platformArch}. Terminal will not work.`);
      loggers.logWarn(PREPARE_PREBUILDS_HINT);
    } else {
      logDeployRequired({
        loggers,
        installer,
        componentId: NODE_PTY_COMPONENT,
        reason: decision.reason,
      });
      loggers.log("installing node-pty prebuild...");
      await installer.installFile({
        componentId: NODE_PTY_COMPONENT,
        sourceRelativePath,
        remotePath: NODE_PTY_PATH,
      });
      await writeRemoteAssetComponentMeta(backend, {
        id: NODE_PTY_COMPONENT,
        version: expectedVersion ?? "unknown",
        platformArch,
      });
      loggers.log("node-pty install done");
    }
  } else {
    loggers.log("node-pty prebuild already exists, skip");
  }

  if (env.platform !== "darwin") {
    return;
  }
  const helperRequired = decision.shouldDeploy || !(await backend.exists(SPAWN_HELPER_PATH));
  if (!helperRequired) {
    loggers.log("node-pty spawn-helper already exists, skip");
    return;
  }

  const sourceRelativePath = `node-pty/${platformArch}/spawn-helper`;
  if (
    installer instanceof LocalUploadAssetInstaller &&
    !(await installer.tryResolveLocalPath([NODE_PTY_COMPONENT], sourceRelativePath))
  ) {
    loggers.logWarn(
      `WARNING: no node-pty spawn-helper for ${platformArch}. Terminal may fail to start.`,
    );
    loggers.logWarn(PREPARE_PREBUILDS_HINT);
    return;
  }

  loggers.log("installing node-pty spawn-helper...");
  if (!decision.shouldDeploy) {
    logDeployRequired({
      loggers,
      installer,
      componentId: NODE_PTY_COMPONENT,
      reason: `remote file missing path=${SPAWN_HELPER_PATH}`,
    });
  }
  await installer.installFile({
    componentId: NODE_PTY_COMPONENT,
    sourceRelativePath,
    remotePath: SPAWN_HELPER_PATH,
    executable: true,
  });
  loggers.log("node-pty spawn-helper install done");
}
