// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 存储层公开入口：工件读写走 artifact-files，媒体附件走 artifact-media（含单飞合并），
// 会话存储整体再导出，信任库整体再导出。

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

/** 可传取消信号的调用选项：与 port 声明的结构等价，仅用于压缩签名。 */
type CallOptions = { signal?: AbortSignal } | undefined;
type MediaFlight = Promise<MediaAttachmentPathResult>;

/** 缓存子目录：pdf 未显式给出时取根目录的兄弟目录。 */
function buildRoots(settings: NodeToolArtifactStoreOptions): ArtifactRoots {
  const roots = {} as ArtifactRoots;
  roots.rootDir = settings.rootDir;
  roots.imageCacheRootDir = settings.imageCacheRootDir;
  roots.videoCacheRootDir = settings.videoCacheRootDir;
  roots.pdfCacheRootDir = settings.pdfCacheRootDir ?? join(dirname(settings.rootDir), "pdf-cache");
  return roots;
}

export class NodeToolArtifactStore implements ToolArtifactStorePort {
  readonly #cache: ArtifactRoots;
  readonly #flights = new Map<string, MediaFlight>();

  constructor(settings: NodeToolArtifactStoreOptions) {
    this.#cache = buildRoots(settings);
  }

  writeToolResultArtifact(
    input: ToolArtifactWriteRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactWriteResult> {
    return writeText(this.#cache.rootDir, input, settings?.signal);
  }

  writeToolResultBinaryArtifact(
    input: ToolBinaryArtifactWriteRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactWriteResult> {
    return writeBinary(this.#cache.rootDir, input, settings?.signal);
  }

  readToolResultArtifact(
    input: ToolArtifactReadRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactReadResult> {
    return readText(this.#cache.rootDir, input, settings?.signal);
  }

  readToolResultBinaryArtifact(
    input: ToolArtifactReadRequest,
    settings?: CallOptions,
  ): Promise<ToolBinaryArtifactReadResult> {
    return readBinary(this.#cache.rootDir, input, settings?.signal);
  }

  statToolResultArtifact(
    input: ToolArtifactStatRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactStatResult> {
    return inspectArtifact(this.#cache.rootDir, input, settings?.signal);
  }

  /** 同一 uri 的并发请求共用一次发布；完成后立刻从表中移除（失败也移除）。 */
  #singleFlight(uri: string, launch: () => MediaFlight): MediaFlight {
    const inFlight = this.#flights.get(uri);
    if (inFlight) return inFlight;
    const shared = launch().finally(() => {
      if (this.#flights.get(uri) === shared) this.#flights.delete(uri);
    });
    this.#flights.set(uri, shared);
    return shared;
  }

  primeImageAttachmentPath(input: ImageAttachmentPathPrimeRequest): MediaFlight {
    return this.primeMediaAttachmentPath(input);
  }

  primeMediaAttachmentPath(input: MediaAttachmentPathPrimeRequest): MediaFlight {
    // 同 uri 已有在途发布：直接复用，不再读取入参的 mediaType/bytes（它们可能不可用）。
    const pending = this.#flights.get(input.uri);
    if (pending) return pending;
    const bytes = Buffer.from(input.bytes);
    return this.#singleFlight(input.uri, () =>
      publishMedia(this.#cache, input.uri, input.mediaType, bytes),
    );
  }

  ensureMediaAttachmentPath(input: MediaAttachmentPathEnsureRequest): MediaFlight {
    return this.#singleFlight(input.uri, async () =>
      ensureMedia(this.#cache, input.uri, input.mediaType, (uri) =>
        this.readToolResultArtifact({ uri }),
      ),
    );
  }
}

export function createNodeToolArtifactStore(
  settings: NodeToolArtifactStoreOptions,
): ToolArtifactStorePort {
  return new NodeToolArtifactStore(settings);
}

export * from "./workspace-hook-trust-store.js";
