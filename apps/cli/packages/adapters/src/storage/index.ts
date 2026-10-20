// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 存储层公开入口：工件读写走 artifact-files，媒体附件走 artifact-media（含单飞合并），
// 会话存储整体再导出，信任库整体再导出。

/**
 * 工件存储的门面。五类落盘操作（文本读写、二进制读写、元信息）都只是把
 * 「缓存根 + 请求 + 取消信号」转交给 artifact-files 的实现；媒体附件另有单飞约束：
 * 同一 uri 的并发发布只跑一次，后面来的请求复用同一个 Promise。
 *
 * 缓存根的默认值：pdf 未显式配置时取根目录的兄弟目录 pdf-cache。
 */

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

/** 可选的取消信号（与 port 声明的结构等价，单独取名只为压短方法签名）。 */
type CallOptions = { signal?: AbortSignal } | undefined;

/** 一次媒体发布的挂起结果。 */
type MediaFlight = Promise<MediaAttachmentPathResult>;

/** pdf 缓存的默认目录名。 */
const DEFAULT_PDF_CACHE_DIRECTORY = "pdf-cache";

/** 把设置摊成四个缓存根；pdf 缺省时落在根目录的兄弟目录。 */
function buildRoots(settings: NodeToolArtifactStoreOptions): ArtifactRoots {
  const roots = {} as ArtifactRoots;
  roots.rootDir = settings.rootDir;
  roots.imageCacheRootDir = settings.imageCacheRootDir;
  roots.videoCacheRootDir = settings.videoCacheRootDir;
  roots.pdfCacheRootDir =
    settings.pdfCacheRootDir ?? join(dirname(settings.rootDir), DEFAULT_PDF_CACHE_DIRECTORY);
  return roots;
}

export class NodeToolArtifactStore implements ToolArtifactStorePort {
  readonly #cache: ArtifactRoots;
  readonly #flights = new Map<string, MediaFlight>();

  constructor(settings: NodeToolArtifactStoreOptions) {
    this.#cache = buildRoots(settings);
  }

  /** 文本工件写入。 */
  writeToolResultArtifact(
    input: ToolArtifactWriteRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactWriteResult> {
    return writeText(this.#cache.rootDir, input, settings?.signal);
  }

  /** 二进制工件写入。 */
  writeToolResultBinaryArtifact(
    input: ToolBinaryArtifactWriteRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactWriteResult> {
    return writeBinary(this.#cache.rootDir, input, settings?.signal);
  }

  /** 文本工件读取。 */
  readToolResultArtifact(
    input: ToolArtifactReadRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactReadResult> {
    return readText(this.#cache.rootDir, input, settings?.signal);
  }

  /** 二进制工件读取。 */
  readToolResultBinaryArtifact(
    input: ToolArtifactReadRequest,
    settings?: CallOptions,
  ): Promise<ToolBinaryArtifactReadResult> {
    return readBinary(this.#cache.rootDir, input, settings?.signal);
  }

  /** 工件元信息。 */
  statToolResultArtifact(
    input: ToolArtifactStatRequest,
    settings?: CallOptions,
  ): Promise<ToolArtifactStatResult> {
    return inspectArtifact(this.#cache.rootDir, input, settings?.signal);
  }

  /**
   * 同一 uri 的并发发布合并为一次。无论成功失败，完成后立刻从在途表移除，
   * 这样后续请求会重新发起而不是永远拿到失败的结果。
   */
  #singleFlight(uri: string, launch: () => MediaFlight): MediaFlight {
    const inFlight = this.#flights.get(uri);
    if (inFlight !== undefined) return inFlight;
    const shared = launch().finally(() => {
      if (this.#flights.get(uri) === shared) this.#flights.delete(uri);
    });
    this.#flights.set(uri, shared);
    return shared;
  }

  /** 图片附件预热：与通用媒体预热同一条路径。 */
  primeImageAttachmentPath(input: ImageAttachmentPathPrimeRequest): MediaFlight {
    return this.primeMediaAttachmentPath(input);
  }

  /**
   * 媒体附件预热。已有同 uri 的在途发布时直接复用 —— 此时**不再读取入参的
   * mediaType/bytes**，因为它们可能已不可用。
   */
  primeMediaAttachmentPath(input: MediaAttachmentPathPrimeRequest): MediaFlight {
    const pending = this.#flights.get(input.uri);
    if (pending !== undefined) return pending;
    const bytes = Buffer.from(input.bytes);
    return this.#singleFlight(input.uri, () =>
      publishMedia(this.#cache, input.uri, input.mediaType, bytes),
    );
  }

  /** 确保媒体附件可读：缺失时回落到工件读取。 */
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
