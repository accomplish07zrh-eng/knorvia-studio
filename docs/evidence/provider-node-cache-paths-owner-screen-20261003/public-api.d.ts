export declare function resolveKnorviaBuiltinClientPlatform(): string;

export interface KnorviaBuiltinCachePathOptions {
  readonly environmentConfigRoot: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly knorviaEndpointOrigin: string;
}

export interface KnorviaBuiltinCachePaths {
  readonly activeFilePath: string;
  readonly controlFilePath: string;
}

export declare function resolveKnorviaBuiltinCachePaths(
  options: KnorviaBuiltinCachePathOptions,
): KnorviaBuiltinCachePaths;

export declare function createKnorviaBuiltinEndpointKey(knorviaEndpointOrigin: string): string;

export declare function normalizeKnorviaBuiltinEndpointOrigin(value: string): string;
