import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { KNORVIA_VERSION } from "@knorvia/shared";
import type { IRemoteBackend, RemoteEnvironment } from "@knorvia/server/remote/backend.js";
import {
  REMOTE_BASE,
  waitForClose,
  type DeployLoggers,
} from "@knorvia/server/remote/deployShared.js";
import {
  buildWriteLiteralFileCommand,
  quotePosixPathArg,
} from "@knorvia/server/remote/posixShell.js";
import {
  fetchRemoteAssetManifestRefFromCdn,
  type RemoteAssetManifest,
  type RemoteAssetManifestRef,
} from "@knorvia/server/remote/remoteAssetCache.js";
import {
  buildReleaseBaseCandidates,
  resolveRemoteCdnBaseUrls,
} from "@knorvia/server/remote/remoteAssetCdn.js";
import type { RemoteAssetNetworkPort } from "@knorvia/server/remote/remoteAssetNetwork.js";

export interface RemoteAssetIdentityResolverOptions {
  mockCdnDir?: string;
  remoteCdnBaseUrl?: string;
  remoteCdnBaseUrls?: string[];
  remoteCacheDir?: string;
  manifestRequestTimeoutMs?: number;
  remoteAssetNetwork?: RemoteAssetNetworkPort;
}

export interface RemoteAssetComponentIdentity {
  sha256: string;
}

export interface RemoteAssetComponentMeta {
  id: string;
  version?: string;
  sha256?: string;
  pendingRefreshAppVersion?: string;
  platformArch: string;
}

export type RemoteAssetComponentIdentityDecision =
  | { shouldDeploy: false }
  | { shouldDeploy: true; reason: string };

const COMPONENT_META_DIRECTORY = `${REMOTE_BASE}/.asset-components`;

function componentMetaPath(componentId: string): string {
  return `${COMPONENT_META_DIRECTORY}/${componentId}.json`;
}

export function createFreshRemoteAssetManifestRefResolver(
  options: RemoteAssetIdentityResolverOptions,
  env: RemoteEnvironment,
  loggers: DeployLoggers,
): () => Promise<RemoteAssetManifestRef | null> {
  let pinnedManifest: Promise<RemoteAssetManifestRef | null> | undefined;

  async function requestManifest(): Promise<RemoteAssetManifestRef | null> {
    const platformArch = `${env.platform}-${env.arch}`;

    if (options.mockCdnDir) {
      try {
        const manifestPath = join(
          options.mockCdnDir,
          "releases",
          KNORVIA_VERSION,
          `manifest-${platformArch}.json`,
        );
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RemoteAssetManifest;
        return {
          manifest,
          releaseBaseCandidatesForComponents: buildReleaseBaseCandidates(
            resolveRemoteCdnBaseUrls(options),
            KNORVIA_VERSION,
          ),
        };
      } catch (error) {
        loggers.logWarn(
          `[remote-assets] mock component manifest unavailable, fallback to release checks: ${String(error)}`,
        );
        return null;
      }
    }

    try {
      const ref = await fetchRemoteAssetManifestRefFromCdn(
        {
          remoteCdnBaseUrl: options.remoteCdnBaseUrl,
          remoteCdnBaseUrls: options.remoteCdnBaseUrls,
          remoteCacheDir: options.remoteCacheDir,
          version: KNORVIA_VERSION,
          platformArch,
          manifestRequestTimeoutMs: options.manifestRequestTimeoutMs,
          remoteAssetNetwork: options.remoteAssetNetwork,
          refreshManifest: true,
        },
        loggers,
      );
      const hasConfiguredManifestSource =
        Boolean(options.remoteCacheDir?.trim()) &&
        (Boolean(options.remoteCdnBaseUrl?.trim()) ||
          Boolean(options.remoteCdnBaseUrls?.some((base) => base.trim().length > 0)));
      if (!ref && hasConfiguredManifestSource) {
        throw new Error(
          `[remote-assets] manifest not found for ${platformArch}: manifest-${platformArch}.json`,
        );
      }
      return ref;
    } catch (error) {
      loggers.logWarn(`[remote-assets] component manifest request failed: ${String(error)}`);
      throw error;
    }
  }

  return () => (pinnedManifest ??= requestManifest());
}

export async function readRemoteAssetComponentMeta(
  backend: IRemoteBackend,
  componentId: string,
): Promise<RemoteAssetComponentMeta | null> {
  try {
    const parsed = JSON.parse(
      await backend.readFile(componentMetaPath(componentId)),
    ) as RemoteAssetComponentMeta | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.platformArch !== "string" ||
      (parsed.version !== undefined && typeof parsed.version !== "string") ||
      (parsed.sha256 !== undefined && typeof parsed.sha256 !== "string") ||
      (parsed.pendingRefreshAppVersion !== undefined &&
        typeof parsed.pendingRefreshAppVersion !== "string")
    ) {
      return null;
    }
    return {
      id: parsed.id,
      ...(parsed.version ? { version: parsed.version } : {}),
      ...(parsed.sha256 ? { sha256: parsed.sha256 } : {}),
      ...(parsed.pendingRefreshAppVersion
        ? { pendingRefreshAppVersion: parsed.pendingRefreshAppVersion }
        : {}),
      platformArch: parsed.platformArch,
    };
  } catch {
    return null;
  }
}

export async function writeRemoteAssetComponentMeta(
  backend: IRemoteBackend,
  meta: RemoteAssetComponentMeta,
): Promise<void> {
  if (meta.version === "unknown" && !meta.sha256) {
    return;
  }
  const command = [
    `mkdir -p ${quotePosixPathArg(COMPONENT_META_DIRECTORY)}`,
    buildWriteLiteralFileCommand(componentMetaPath(meta.id), `${JSON.stringify(meta)}\n`),
  ].join(" && ");
  const stream = await backend.exec(command);
  await waitForClose(stream);
}

export async function markRemoteAssetComponentRefreshPending(
  backend: IRemoteBackend,
  options: { componentId: string; platformArch: string; appVersion: string },
): Promise<void> {
  await writeRemoteAssetComponentMeta(backend, {
    id: options.componentId,
    platformArch: options.platformArch,
    pendingRefreshAppVersion: options.appVersion,
  });
}

export async function hasRemoteAssetComponentRefreshPending(
  backend: IRemoteBackend,
  options: { componentId: string; platformArch: string },
): Promise<boolean> {
  const meta = await readRemoteAssetComponentMeta(backend, options.componentId);
  return Boolean(
    meta &&
    meta.id === options.componentId &&
    meta.platformArch === options.platformArch &&
    meta.pendingRefreshAppVersion,
  );
}

export async function checkRemoteAssetComponentIdentity(
  backend: IRemoteBackend,
  options: {
    componentId: string;
    platformArch: string;
    expectedIdentity: RemoteAssetComponentIdentity;
  },
): Promise<RemoteAssetComponentIdentityDecision> {
  const remoteMeta = await readRemoteAssetComponentMeta(backend, options.componentId);
  let reason: string;

  if (!remoteMeta) {
    reason = `remote component meta missing expected=${options.expectedIdentity.sha256}`;
  } else if (remoteMeta.id !== options.componentId) {
    reason = `remote component id mismatch remote=${remoteMeta.id} expected=${options.componentId}`;
  } else if (remoteMeta.platformArch !== options.platformArch) {
    reason = `remote platform mismatch remote=${remoteMeta.platformArch} expected=${options.platformArch}`;
  } else if (!remoteMeta.sha256) {
    reason = `remote component SHA missing expected=${options.expectedIdentity.sha256}`;
  } else if (
    remoteMeta.sha256.trim().toLowerCase() !== options.expectedIdentity.sha256.trim().toLowerCase()
  ) {
    reason = `remote SHA mismatch remote=${remoteMeta.sha256} expected=${options.expectedIdentity.sha256}`;
  } else {
    return { shouldDeploy: false };
  }

  return { shouldDeploy: true, reason };
}
