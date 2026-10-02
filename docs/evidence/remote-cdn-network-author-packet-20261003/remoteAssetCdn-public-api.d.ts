export interface RemoteCdnBaseOptions {
    remoteCdnBaseUrl?: string;
    remoteCdnBaseUrls?: string[];
}
export declare function resolveRemoteCdnBaseUrls(options: RemoteCdnBaseOptions): string[];
export declare function buildReleaseBaseCandidates(remoteCdnBaseUrls: string[], version: string): string[];
export declare function buildReleaseAssetUrlCandidates(releaseBaseCandidates: string[], fileCandidates: string[]): string[];
export declare function buildArtifactUrlCandidates(remoteCdnBaseUrls: string[], artifactPath: string): string[];
export declare function buildComponentArtifactUrlCandidates(releaseBaseCandidates: string[], artifactPath: string, version: string): string[];
export declare function buildComponentReleaseBaseCandidates(releaseBaseCandidates: string[], version: string): string[];
export declare function normalizeRemoteAssetRelativePath(rawPath: string, label: string): string;
export declare function assertRemoteCdnBaseVersionMatches(remoteCdnBaseUrls: string[], expectedVersion: string): void;
