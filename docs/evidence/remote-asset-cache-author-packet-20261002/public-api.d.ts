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
export declare function createRemoteAssetManifestRequestSignal(timeoutMs?: number): AbortSignal;
export declare function ensureRemoteReleaseDirFromCdn(options: EnsureRemoteReleaseDirOptions, loggers: RemoteAssetCacheLoggers): Promise<string>;
export declare function fetchRemoteAssetManifestFromCdn(options: EnsureRemoteReleaseDirOptions, loggers: RemoteAssetCacheLoggers): Promise<RemoteAssetManifest | null>;
export declare function fetchRemoteAssetManifestRefFromCdn(options: EnsureRemoteReleaseDirOptions, loggers: RemoteAssetCacheLoggers): Promise<RemoteAssetManifestRef | null>;
export declare function selectRemoteAssetManifestComponents(manifest: RemoteAssetManifest, componentIds?: string[]): RemoteAssetManifestComponent[];
export declare function buildRemoteAssetManifestFileCandidates(platformArch: string): string[];
export declare function parseRemoteAssetManifestFromResponse(response: Response, sourceUrl: string, expectedAppVersion: string, expectedPlatformArch: string): Promise<RemoteAssetManifest>;
export declare function usesRemoteAssetContentAddressedCacheIdentity(componentId: string): boolean;
export declare function resolveRemoteAssetComponentCacheVersion(version: string): string;
export declare function readCachedRemoteAssetMarker(cacheDir: string): Promise<string | null>;
export declare function resolveFallbackRemoteAssetCacheDir(): string;
