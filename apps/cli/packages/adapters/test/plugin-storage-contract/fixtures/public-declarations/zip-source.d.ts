// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

export interface ResolvedZipPluginSourceRoot {
  cleanup: () => Promise<void>;
  path: string;
}
interface ResolveZipPluginSourceInput {
  headers?: Record<string, string>;
  path?: string;
  sha256: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  url: string;
}
interface ResolveHttpZipSourceInput {
  headers?: Record<string, string>;
  path?: string;
  requireSingleRoot?: boolean;
  sha256?: string;
  signal?: AbortSignal;
  stripRoot?: boolean;
  url: string;
}
export declare class PluginZipDownloadError extends Error {
  readonly status?: number;
  readonly url: string;
  constructor(message: string, url: string, status?: number);
}
export declare function resolveZipPluginSource(
  input: ResolveZipPluginSourceInput,
): Promise<ResolvedZipPluginSourceRoot>;
export declare function resolveHttpZipSource(
  input: ResolveHttpZipSourceInput,
): Promise<ResolvedZipPluginSourceRoot>;
export declare function readZipPluginSourceSha256(source: unknown): string | undefined;
export declare function isZipPluginUrlSource(source: unknown): source is {
  source: "url";
  type: "zip";
  sha256: string;
  url: string;
};
export {};
//# sourceMappingURL=zip-source.d.ts.map
