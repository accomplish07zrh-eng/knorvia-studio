import type { KnorviaBuiltinRelease } from "./builtin-release.js";

export interface KnorviaBuiltinDownloadOptions {
  readonly endpointOrigin: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly request: (url: string | URL, init: RequestInit) => Promise<Response>;
  readonly signal?: AbortSignal;
}

export declare function downloadKnorviaBuiltinRelease(
  options: KnorviaBuiltinDownloadOptions,
): Promise<KnorviaBuiltinRelease | null>;
