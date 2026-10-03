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
const missing = Symbol("missing-provider-file");
function emptyUpdate(): ProviderConfigLayerUpdate {
  return Object.freeze({
    providers: ProviderConfigMap.empty(),
    models: ModelConfigRules.empty(),
    providerOrder: [],
  });
}
function snapshot(update: ProviderConfigLayerUpdate): ProviderConfigLayerSnapshot {
  const content = JSON.stringify(encodeProviderConfigFile(update));
  const revision = createHash("sha256").update(content).digest("hex");
  return Object.freeze({
    revision,
    providers: update.providers,
    models: update.models,
    providerOrder: update.providerOrder,
    defaultModelSelection: update.defaultModelSelection,
  });
}
export class NodePersonalProviderConfigRepository implements PersonalProviderConfigRepository {
  readonly #path: string;
  readonly #interval: number | false;
  readonly #legacy: NodePersonalProviderConfigRepositoryOptions["importLegacy"];
  readonly #recovery: NodePersonalProviderConfigRepositoryOptions["onRecovery"];
  readonly #pollingError: NodePersonalProviderConfigRepositoryOptions["onPollingError"];
  readonly #listeners = new Set<(reason: string) => void>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight = false;
  #writes = 0;
  #errorEpisode = false;
  #observed: string | undefined;
  #disposed = false;
  constructor(options: NodePersonalProviderConfigRepositoryOptions) {
    if (!options.filePath.trim()) throw new Error("Personal Provider Config filePath 不能为空");
    this.#path = options.filePath;
    this.#legacy = options.importLegacy;
    this.#recovery = options.onRecovery;
    this.#pollingError = options.onPollingError;
    this.#interval = options.pollingIntervalMs ?? 1000;
    if (this.#interval !== false && this.#interval <= 0)
      throw new Error("Personal Provider Config pollingIntervalMs 必须大于 0");
  }
  #assertActive(): void {
    if (this.#disposed) throw new Error("NodePersonalProviderConfigRepository 已 dispose");
  }
  async read(): Promise<ProviderConfigLayerSnapshot> {
    this.#assertActive();
    try {
      const current = await this.#readCurrent();
      this.#observed ??= current.revision;
      return current;
    } catch (error) {
      try {
        this.#recovery?.(Object.freeze({ error }));
      } catch {
        /* Observational recovery cannot replace the original read recovery. */
      }
      const current = snapshot(emptyUpdate());
      this.#observed ??= current.revision;
      return current;
    } finally {
      this.#ensurePolling();
    }
  }
  async update(
    transform: (current: ProviderConfigLayerSnapshot) => ProviderConfigLayerUpdate,
  ): Promise<ProviderConfigLayerSnapshot> {
    this.#assertActive();
    try {
      const committed = await withFileLock(this.#path, async () => {
        const current = await this.#readLocked();
        const value = transform(current);
        const selected = Object.freeze({
          providers: value.providers,
          models: value.models,
          providerOrder: value.providerOrder,
          defaultModelSelection: value.defaultModelSelection,
        });
        const next = snapshot(await this.#write(selected));
        this.#observed = next.revision;
        return next;
      });
      this.#emit("updated");
      return committed;
    } finally {
      this.#ensurePolling();
    }
  }
  onDidChange(listener: (reason: string) => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#listeners.clear();
  }
  async #document(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.#path, "utf8"));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
        return missing;
      throw error;
    }
  }
  async #readCurrent(): Promise<ProviderConfigLayerSnapshot> {
    const document = await this.#document();
    if (document === missing) {
      if (!this.#legacy) return snapshot(emptyUpdate());
    } else {
      const decoded = decodeProviderConfigFile(document);
      if (JSON.stringify(document) === JSON.stringify(encodeProviderConfigFile(decoded)))
        return snapshot(decoded);
    }
    return withFileLock(this.#path, () => this.#readLocked());
  }
  async #readLocked(): Promise<ProviderConfigLayerSnapshot> {
    const document = await this.#document();
    if (document !== missing) {
      const decoded = decodeProviderConfigFile(document);
      const encoded = encodeProviderConfigFile(decoded);
      if (JSON.stringify(document) !== JSON.stringify(encoded)) await this.#write(decoded);
      return snapshot(decoded);
    }
    const imported = await this.#legacy?.();
    const value = imported ?? emptyUpdate();
    return snapshot(imported ? await this.#write(value) : value);
  }
  async #write(value: ProviderConfigLayerUpdate): Promise<ProviderConfigLayerUpdate> {
    const canonical = decodeProviderConfigFile(encodeProviderConfigFile(value));
    const encoded = encodeProviderConfigFile(canonical);
    await atomicWritePrivateTextFile(this.#path, JSON.stringify(encoded, null, 2));
    this.#writes++;
    return canonical;
  }
  #emit(reason: string): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) listener(reason);
  }
  #ensurePolling(): void {
    if (this.#interval === false || this.#timer || this.#inFlight || this.#disposed) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#poll();
    }, this.#interval);
    this.#timer.unref?.();
  }
  async #pollSnapshot(): Promise<ProviderConfigLayerSnapshot> {
    const document = await this.#document();
    return snapshot(document === missing ? emptyUpdate() : decodeProviderConfigFile(document));
  }
  async #poll(): Promise<void> {
    this.#inFlight = true;
    const generation = this.#writes;
    try {
      // 保留原独立异步快照的结算边界，避免抢在已接受写入的 generation 更新之前发布。
      const current = await this.#pollSnapshot();
      if (generation !== this.#writes) return;
      this.#errorEpisode = false;
      if (this.#disposed || current.revision === this.#observed) return;
      this.#observed = current.revision;
      this.#emit("poll-changed");
    } catch (error) {
      if (generation !== this.#writes || this.#disposed || this.#errorEpisode) return;
      this.#errorEpisode = true;
      try {
        this.#pollingError?.(error);
      } catch {
        /* Error callbacks are observations, not repository state. */
      }
      this.#emit("poll-error");
    } finally {
      this.#inFlight = false;
      this.#ensurePolling();
    }
  }
}
export function createNodePersonalProviderConfigRepository(
  options: NodePersonalProviderConfigRepositoryOptions,
): NodePersonalProviderConfigRepository {
  return new NodePersonalProviderConfigRepository(options);
}
