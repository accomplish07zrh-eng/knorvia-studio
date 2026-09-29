// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { dirname, join } from "node:path";
import type {
  ImageAttachmentPathPrimeRequest,
  MediaAttachmentPathPrimeRequest,
  MediaAttachmentPathEnsureRequest,
  MediaAttachmentPathResult,
  ToolBinaryArtifactWriteRequest,
  ToolArtifactStorePort,
  ToolArtifactReadRequest,
  ToolArtifactReadResult,
  ToolArtifactStatRequest,
  ToolArtifactStatResult,
  ToolArtifactWriteRequest,
  ToolArtifactWriteResult,
  ToolBinaryArtifactReadResult,
} from "@knorvia/contracts";
import { inspectArtifact, readBinary, readText, writeBinary, writeText } from "./artifact-files.js";
import { ensureMedia, publishMedia } from "./artifact-media.js";
import type { ArtifactRoots } from "./artifact-policy.js";

export * from "./session-store.js";
export {
  InMemorySessionEventStore,
  createInMemorySessionEventStore,
  type InMemorySessionEventStoreOptions,
} from "@knorvia/contracts";

export interface NodeToolArtifactStoreOptions {
  imageCacheRootDir: string;
  pdfCacheRootDir?: string;
  rootDir: string;
  videoCacheRootDir: string;
}

export class NodeToolArtifactStore implements ToolArtifactStorePort {
  readonly #roots: ArtifactRoots;
  readonly #flights = new Map<string, Promise<MediaAttachmentPathResult>>();

  constructor(options: NodeToolArtifactStoreOptions) {
    this.#roots = {
      rootDir: options.rootDir,
      imageCacheRootDir: options.imageCacheRootDir,
      videoCacheRootDir: options.videoCacheRootDir,
      pdfCacheRootDir: options.pdfCacheRootDir ?? join(dirname(options.rootDir), "pdf-cache"),
    };
  }

  writeToolResultArtifact(
    request: ToolArtifactWriteRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactWriteResult> {
    return writeText(this.#roots.rootDir, request, options?.signal);
  }

  writeToolResultBinaryArtifact(
    request: ToolBinaryArtifactWriteRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactWriteResult> {
    return writeBinary(this.#roots.rootDir, request, options?.signal);
  }

  readToolResultArtifact(
    request: ToolArtifactReadRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactReadResult> {
    return readText(this.#roots.rootDir, request, options?.signal);
  }

  readToolResultBinaryArtifact(
    request: ToolArtifactReadRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolBinaryArtifactReadResult> {
    return readBinary(this.#roots.rootDir, request, options?.signal);
  }

  statToolResultArtifact(
    request: ToolArtifactStatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ToolArtifactStatResult> {
    return inspectArtifact(this.#roots.rootDir, request, options?.signal);
  }

  #singleFlight(
    uri: string,
    start: () => Promise<MediaAttachmentPathResult>,
  ): Promise<MediaAttachmentPathResult> {
    const existing = this.#flights.get(uri);
    if (existing) return existing;
    const work = start();
    const flight = work.finally(() => {
      if (this.#flights.get(uri) === flight) this.#flights.delete(uri);
    });
    this.#flights.set(uri, flight);
    return flight;
  }

  primeImageAttachmentPath(
    request: ImageAttachmentPathPrimeRequest,
  ): Promise<MediaAttachmentPathResult> {
    return this.primeMediaAttachmentPath(request);
  }

  primeMediaAttachmentPath(
    request: MediaAttachmentPathPrimeRequest,
  ): Promise<MediaAttachmentPathResult> {
    return this.#singleFlight(request.uri, () =>
      publishMedia(this.#roots, request.uri, request.mediaType, Buffer.from(request.bytes)),
    );
  }

  ensureMediaAttachmentPath(
    request: MediaAttachmentPathEnsureRequest,
  ): Promise<MediaAttachmentPathResult> {
    return this.#singleFlight(request.uri, async () =>
      ensureMedia(this.#roots, request.uri, request.mediaType, (uri) =>
        this.readToolResultArtifact({ uri }),
      ),
    );
  }
}

export function createNodeToolArtifactStore(
  options: NodeToolArtifactStoreOptions,
): ToolArtifactStorePort {
  return new NodeToolArtifactStore(options);
}

export * from "./workspace-hook-trust-store.js";
