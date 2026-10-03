import type { ProviderConfigLayerSnapshot, ProviderSource } from "@knorvia/provider";
import type { KnorviaBuiltinRelease } from "./builtin-release.js";

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

export declare function normalizeKnorviaBuiltinEndpointOrigin(value: string): string;

export interface NodeKnorviaBuiltinProviderConfigSourceOptions {
  readonly bundledFilePath: string;
  readonly activeFilePath?: string;
  readonly watch?: boolean;
}

export type KnorviaBuiltinRefreshResult =
  | "updated"
  | "unchanged"
  | "stale"
  | "missing"
  | "skipped"
  | "disposed";

export interface KnorviaBuiltinRemoteSynchronizerOptions {
  readonly source: NodeKnorviaBuiltinProviderConfigSource;
  readonly controlFilePath: string;
  readonly resolveEndpointKey: () => string | Promise<string>;
  readonly fetchRelease: (
    endpointKey: string,
    signal: AbortSignal,
  ) => Promise<KnorviaBuiltinRelease | null>;
  readonly onRefreshResult?: (event: KnorviaBuiltinRefreshEvent) => void;
  readonly now?: () => number;
  readonly successIntervalMs?: number;
  readonly leaseDurationMs?: number;
  readonly failureBaseDelayMs?: number;
  readonly failureMaxDelayMs?: number;
}

export interface KnorviaBuiltinRefreshEvent {
  readonly result: KnorviaBuiltinRefreshResult;
  readonly reason?: "lease-held" | "not-due" | "endpoint-changed";
  readonly revision?: number;
}

export declare class NodeKnorviaBuiltinProviderConfigSource implements ProviderSource<ProviderConfigLayerSnapshot> {
  constructor(options: NodeKnorviaBuiltinProviderConfigSourceOptions);
  read(): Promise<ProviderConfigLayerSnapshot>;
  onDidChange(listener: (reason: string) => void): () => void;
  dispose(): void;
}

export declare class KnorviaBuiltinRemoteSynchronizer {
  constructor(options: KnorviaBuiltinRemoteSynchronizerOptions);
  refresh(options?: { readonly force?: boolean }): Promise<KnorviaBuiltinRefreshResult>;
  dispose(): void;
}
