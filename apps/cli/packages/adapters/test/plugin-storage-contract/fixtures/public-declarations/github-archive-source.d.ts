// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

import { type ResolvedZipPluginSourceRoot } from "./zip-source.js";
interface ResolveGitHubArchiveSourceInput {
  path?: string;
  pin?: string;
  signal?: AbortSignal;
  url: string;
}
export declare function resolveGitHubArchiveSource(
  input: ResolveGitHubArchiveSourceInput,
): Promise<ResolvedZipPluginSourceRoot>;
export declare function shouldFallbackGitHubArchiveToGit(error: unknown): boolean;
export {};
//# sourceMappingURL=github-archive-source.d.ts.map
