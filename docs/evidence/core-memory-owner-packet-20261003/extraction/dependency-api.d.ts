// Public dependencies stay opaque at original owners; not standalone compilation.
// Original type owner: apps/cli/packages/core/src/memory/memory-file-path.ts
export declare function resolveContainedMemoryFilePath(input: {
    filePath: string;
    rootDir: string;
    workingDirectory: string;
    workspaceRoot: string;
}): string | undefined;
// Original type owner: apps/cli/packages/core/src/memory/recall/manifest.ts
import type { FileSystemPort } from "@knorvia/contracts";
import { type MemoryManifestEntry } from "./types.js";
export declare function formatMemoryManifest(manifest: readonly MemoryManifestEntry[]): string;
