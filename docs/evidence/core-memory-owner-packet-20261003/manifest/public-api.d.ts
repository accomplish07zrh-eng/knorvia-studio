import type { FileSystemPort } from "@knorvia/contracts";
import { type MemoryManifestEntry } from "./types.js";
export declare function scanMemoryManifest(input: {
    fileSystem: FileSystemPort;
    rootDir: string;
    signal?: AbortSignal;
}): Promise<MemoryManifestEntry[]>;
export declare function formatMemoryManifest(manifest: readonly MemoryManifestEntry[]): string;
