// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ModelConfigRules,
  ProviderConfigMap,
  type PersonalProviderConfigRepository,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@knorvia/provider";
import { atomicWritePrivateTextFile, withFileLock } from "@knorvia/shared/node";
import {
  decodeProviderConfigFile,
  encodeProviderConfigFile,
} from "./provider-config-file-codec.js";

export interface NodePersonalProviderConfigRepositoryOptions {
  readonly filePath: string;
  readonly importLegacy?: () => Promise<ProviderConfigLayerUpdate | null>;
  readonly onRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPollingError?: (error: unknown) => void;
  readonly pollingIntervalMs?: number | false;
}

export interface PersonalProviderConfigRecoveryEvent {
  readonly error: unknown;
}

const FILE_PATH_REQUIRED = "Personal Provider Config filePath 不能为空";
const POLL_INTERVAL_POSITIVE = "Personal Provider Config pollingIntervalMs 必须大于 0";
const REPOSITORY_DISPOSED = "NodePersonalProviderConfigRepository 已 dispose";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const ABSENT_FILE = Symbol("provider-config-absent");

type FileState = typeof ABSENT_FILE | { readonly document: unknown };

const blankLayer = (): ProviderConfigLayerUpdate => ({
  providers: ProviderConfigMap.empty(),
  models: ModelConfigRules.empty(),
  providerOrder: [],
});

const hashLayer = (layer: ProviderConfigLayerUpdate): string =>
  createHash("sha256")
    .update(JSON.stringify(encodeProviderConfigFile(layer)))
    .digest("hex");

const layerSnapshot = (layer: ProviderConfigLayerUpdate): ProviderConfigLayerSnapshot =>
  Object.freeze({
    revision: hashLayer(layer),
    providers: layer.providers,
    models: layer.models,
    providerOrder: layer.providerOrder,
    defaultModelSelection: layer.defaultModelSelection,
  });

const isAbsentFault = (fault: unknown): boolean =>
  typeof fault === "object" && fault !== null && "code" in fault && fault.code === "ENOENT";

// 文件在 / 不在 是唯一需要区分的两态；其余读取失败一律向上抛给恢复流程。
const loadFileState = async (filePath: string): Promise<FileState> => {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (fault) {
    if (isAbsentFault(fault)) return ABSENT_FILE;
    throw fault;
  }
  return { document: JSON.parse(source) };
};

const samePayload = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class NodePersonalProviderConfigRepository implements PersonalProviderConfigRepository {
  readonly #filePath: string;
  readonly #pollIntervalMs: number | false;
  readonly #importLegacy: NodePersonalProviderConfigRepositoryOptions["importLegacy"];
  readonly #recoveryHandler: NodePersonalProviderConfigRepositoryOptions["onRecovery"];
  readonly #pollingFailureHandler: NodePersonalProviderConfigRepositoryOptions["onPollingError"];

  readonly #subscribers = new Set<(reason: string) => void>();
  #pollHandle: ReturnType<typeof setTimeout> | undefined;
  #pollRunning = false;
  #writeGeneration = 0;
  #errorEpisodeOpen = false;
  #observedRevision: string | undefined;
  #disposed = false;

  constructor(options: NodePersonalProviderConfigRepositoryOptions) {
    if (!options.filePath.trim()) throw new Error(FILE_PATH_REQUIRED);
    const interval = options.pollingIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (interval !== false && interval <= 0) throw new Error(POLL_INTERVAL_POSITIVE);
    this.#filePath = options.filePath;
    this.#pollIntervalMs = interval;
    this.#importLegacy = options.importLegacy;
    this.#recoveryHandler = options.onRecovery;
    this.#pollingFailureHandler = options.onPollingError;
  }

  #refuseWhenDisposed(): void {
    if (this.#disposed) throw new Error(REPOSITORY_DISPOSED);
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    this.#refuseWhenDisposed();
    try {
      const layer = await this.#readLayer();
      this.#remember(layer.revision);
      return layer;
    } catch (fault) {
      try {
        this.#recoveryHandler?.(Object.freeze({ error: fault }));
      } catch {
        /* 恢复回调只做观察，不能替换原始读取结果。 */
      }
      const fallback = layerSnapshot(blankLayer());
      this.#remember(fallback.revision);
      return fallback;
    } finally {
      this.#armPolling();
    }
  }

  async update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot> {
    this.#refuseWhenDisposed();
    try {
      const committed = await withFileLock(this.#filePath, async () => {
        const base = await this.#layerUnderLock();
        const proposed = transform(base);
        const selected = Object.freeze({
          providers: proposed.providers,
          models: proposed.models,
          providerOrder: proposed.providerOrder,
          defaultModelSelection: proposed.defaultModelSelection,
        });
        const stored = await this.#commitLayer(selected);
        const next = layerSnapshot(stored);
        this.#observedRevision = next.revision;
        return next;
      });
      this.#broadcast("updated");
      return committed;
    } finally {
      this.#armPolling();
    }
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#refuseWhenDisposed();
    this.#subscribers.add(listener);
    return () => {
      this.#subscribers.delete(listener);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#pollHandle !== undefined) clearTimeout(this.#pollHandle);
    this.#pollHandle = undefined;
    this.#subscribers.clear();
  }

  #remember(revision: string): void {
    this.#observedRevision ??= revision;
  }

  // 未规范化或缺失的文件必须在锁内处理：读、解码、重写与导入都在同一临界区。
  async #readLayer(): Promise<ProviderConfigLayerSnapshot> {
    const state = await loadFileState(this.#filePath);
    if (state === ABSENT_FILE) {
      return this.#importLegacy ? this.#lockedLayer() : layerSnapshot(blankLayer());
    }
    const decoded = decodeProviderConfigFile(state.document);
    if (samePayload(state.document, encodeProviderConfigFile(decoded))) {
      return layerSnapshot(decoded);
    }
    return this.#lockedLayer();
  }

  #lockedLayer(): Promise<ProviderConfigLayerSnapshot> {
    return withFileLock(this.#filePath, () => this.#layerUnderLock());
  }

  // 已在文件锁内的读取：重写与导入都复用调用方的临界区，不能再次抢同一把锁。
  async #layerUnderLock(): Promise<ProviderConfigLayerSnapshot> {
    const state = await loadFileState(this.#filePath);
    if (state !== ABSENT_FILE) {
      const decoded = decodeProviderConfigFile(state.document);
      if (!samePayload(state.document, encodeProviderConfigFile(decoded))) {
        await this.#commitLayer(decoded);
      }
      return layerSnapshot(decoded);
    }
    const imported = await this.#importLegacy?.();
    if (!imported) return layerSnapshot(blankLayer());
    return layerSnapshot(await this.#commitLayer(imported));
  }

  // 写前先把 transform 结果压回规范文档，落盘文本因此与 revision 的哈希输入一致。
  async #commitLayer(layer: ProviderConfigLayerUpdate): Promise<ProviderConfigLayerUpdate> {
    const canonical = decodeProviderConfigFile(encodeProviderConfigFile(layer));
    await atomicWritePrivateTextFile(
      this.#filePath,
      JSON.stringify(encodeProviderConfigFile(canonical), null, 2),
    );
    this.#writeGeneration += 1;
    return canonical;
  }

  #broadcast(reason: string): void {
    if (this.#disposed) return;
    for (const listener of this.#subscribers) listener(reason);
  }

  #armPolling(): void {
    if (this.#pollIntervalMs === false) return;
    if (this.#pollHandle !== undefined || this.#pollRunning || this.#disposed) return;
    this.#pollHandle = setTimeout(() => {
      this.#pollHandle = undefined;
      void this.#pollOnce();
    }, this.#pollIntervalMs);
    this.#pollHandle.unref?.();
  }

  async #pollOnce(): Promise<void> {
    this.#pollRunning = true;
    const generation = this.#writeGeneration;
    try {
      const state = await loadFileState(this.#filePath);
      const current = layerSnapshot(
        state === ABSENT_FILE ? blankLayer() : decodeProviderConfigFile(state.document),
      );
      if (generation !== this.#writeGeneration) return;
      this.#errorEpisodeOpen = false;
      if (this.#disposed || current.revision === this.#observedRevision) return;
      this.#observedRevision = current.revision;
      this.#broadcast("poll-changed");
    } catch (fault) {
      if (generation !== this.#writeGeneration || this.#disposed || this.#errorEpisodeOpen) return;
      this.#errorEpisodeOpen = true;
      try {
        this.#pollingFailureHandler?.(fault);
      } catch {
        /* 错误回调同样只是观察者。 */
      }
      this.#broadcast("poll-error");
    } finally {
      this.#pollRunning = false;
      this.#armPolling();
    }
  }
}

export function createNodePersonalProviderConfigRepository(
  options: NodePersonalProviderConfigRepositoryOptions,
): NodePersonalProviderConfigRepository {
  return new NodePersonalProviderConfigRepository(options);
}
