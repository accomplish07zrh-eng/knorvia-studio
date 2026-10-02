// @knorvia/server/remote/deployShared.js
export declare function fileExists(...pathParts: string[]): Promise<boolean>;

// @knorvia/server/remote/localTarGz.js
export declare function extractTarGzArchive(archivePath: string, targetDir: string): Promise<void>;

// @knorvia/server/remote/remoteAssetCdn.js
export interface RemoteCdnBaseOptions {
    remoteCdnBaseUrl?: string;
    remoteCdnBaseUrls?: string[];
}
export declare function resolveRemoteCdnBaseUrls(options: RemoteCdnBaseOptions): string[];
export declare function buildReleaseBaseCandidates(remoteCdnBaseUrls: string[], version: string): string[];
export declare function buildReleaseAssetUrlCandidates(releaseBaseCandidates: string[], fileCandidates: string[]): string[];
export declare function buildComponentArtifactUrlCandidates(releaseBaseCandidates: string[], artifactPath: string, version: string): string[];
export declare function normalizeRemoteAssetRelativePath(rawPath: string, label: string): string;
export declare function assertRemoteCdnBaseVersionMatches(remoteCdnBaseUrls: string[], expectedVersion: string): void;

// @knorvia/server/remote/remoteAssetNetwork.js
export interface RemoteAssetNetworkPort {
    fetch: typeof globalThis.fetch;
}
export declare function resolveRemoteAssetFetch(network: RemoteAssetNetworkPort | undefined): typeof globalThis.fetch;

