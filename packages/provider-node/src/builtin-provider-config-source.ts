import { watch, type FSWatcher } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { ProviderConfigLayerSnapshot, ProviderSource } from "@knorvia/provider";
import { atomicWritePrivateTextFile, withFileLock } from "@knorvia/shared/node";
import {
  decodeKnorviaBuiltinRelease,
  encodeKnorviaBuiltinRelease,
  serializeKnorviaBuiltinRelease,
  type KnorviaBuiltinRelease,
} from "./builtin-release.js";

export interface NodeKnorviaBuiltinProviderConfigSourceOptions {
  readonly bundledFilePath: string;
  readonly activeFilePath?: string;
  readonly watch?: boolean;
}

export type ApplyKnorviaBuiltinReleaseResult = "updated" | "unchanged" | "stale";

/** Bundled、Active/LKG 与 Remote 共用同一 Release，并最终发布为现有 Config Snapshot。 */
export class NodeKnorviaBuiltinProviderConfigSource implements ProviderSource<ProviderConfigLayerSnapshot> {
  #bundledFilePath: string;
  #activeFilePath: string;
  #sourceKey: string;
  #watchEnabled: boolean;
  #listeners = new Set<(reason: string) => void>();
  #watcher: FSWatcher | null = null;
  #observedSignature: string | null = null;
  #watchTail: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(options: NodeKnorviaBuiltinProviderConfigSourceOptions) {
    const bundledFilePath = options.bundledFilePath.trim();
    if (!bundledFilePath) {
      throw new Error("Knorvia Studio Built-in bundledFilePath 不能为空");
    }
    this.#bundledFilePath = bundledFilePath;
    this.#activeFilePath = options.activeFilePath?.trim() || bundledFilePath;
    this.#sourceKey = createHash("sha256").update(resolve(this.#activeFilePath)).digest("hex");
    this.#watchEnabled = options.watch !== false;
  }

  get activeFilePath(): string {
    return this.#activeFilePath;
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    this.#assertNotDisposed();
    let release: KnorviaBuiltinRelease;
    try {
      await this.#ensureWatcher();
      release = await withFileLock(this.#activeFilePath, () => this.#readAndMaterializeLocked());
    } catch {
      const bundled = await readReleaseCandidate(this.#bundledFilePath);
      release = selectReleaseCandidate(bundled, null);
    }
    this.#observedSignature ??= releaseSignature(release);
    return createLayerSnapshot(release, this.#sourceKey);
  }

  async applyRemoteRelease(
    release: KnorviaBuiltinRelease,
  ): Promise<ApplyKnorviaBuiltinReleaseResult> {
    this.#assertNotDisposed();
    await this.#ensureWatcher();
    const result = await withFileLock(
      this.#activeFilePath,
      async (): Promise<ApplyKnorviaBuiltinReleaseResult> => {
        this.#assertNotDisposed();
        const current = await this.#readAndMaterializeLocked();
        this.#assertNotDisposed();
        if (release.revision < current.revision) {
          return "stale";
        }
        if (release.revision === current.revision) {
          if (serializeKnorviaBuiltinRelease(release) === serializeKnorviaBuiltinRelease(current)) {
            return "unchanged";
          }
          throw new Error(`Knorvia Studio Built-in 相同 revision ${release.revision} 对应不同内容`);
        }
        await this.#writeActiveLocked(release);
        this.#observedSignature = releaseSignature(release);
        return "updated";
      },
    );
    if (result === "updated" && !this.#disposed) {
      this.#emit("remote-updated");
    }
    return result;
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#assertNotDisposed();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#watcher?.close();
    this.#watcher = null;
    this.#listeners.clear();
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error("NodeKnorviaBuiltinProviderConfigSource 已 dispose");
    }
  }

  async #ensureWatcher(): Promise<void> {
    await mkdir(dirname(this.#activeFilePath), { recursive: true });
    if (!this.#watchEnabled || this.#watcher || this.#disposed) {
      return;
    }
    const target = basename(this.#activeFilePath);
    this.#watcher = watch(dirname(this.#activeFilePath), (_eventType, fileName) => {
      if (fileName === null || fileName.toString() === target) {
        this.#scheduleWatchRead();
      }
    });
    this.#watcher.on("error", () => this.#emit("watch-error"));
  }

  #scheduleWatchRead(): void {
    this.#watchTail = this.#watchTail.then(async () => {
      if (this.#disposed) {
        return;
      }
      try {
        const release = await withFileLock(this.#activeFilePath, () =>
          this.#readAndMaterializeLocked(),
        );
        const signature = releaseSignature(release);
        if (this.#disposed || signature === this.#observedSignature) {
          return;
        }
        this.#observedSignature = signature;
        this.#emit("file-changed");
      } catch {
        this.#emit("watch-error");
      }
    });
  }

  async #readAndMaterializeLocked(): Promise<KnorviaBuiltinRelease> {
    const [bundled, active] = await Promise.all([
      readReleaseCandidate(this.#bundledFilePath),
      this.#activeFilePath === this.#bundledFilePath
        ? Promise.resolve(null)
        : readReleaseCandidate(this.#activeFilePath),
    ]);
    const selected = selectReleaseCandidate(bundled, active);
    if (this.#activeFilePath !== this.#bundledFilePath) {
      const activeSignature = active?.release ? releaseSignature(active.release) : null;
      if (activeSignature !== releaseSignature(selected)) {
        await this.#writeActiveLocked(selected);
      }
    }
    return selected;
  }

  async #writeActiveLocked(release: KnorviaBuiltinRelease): Promise<void> {
    this.#assertNotDisposed();
    await atomicWritePrivateTextFile(
      this.#activeFilePath,
      JSON.stringify(encodeKnorviaBuiltinRelease(release), null, 2),
    );
  }

  #emit(reason: string): void {
    if (this.#disposed) {
      return;
    }
    for (const listener of this.#listeners) {
      listener(reason);
    }
  }
}

export function createNodeKnorviaBuiltinProviderConfigSource(
  options: NodeKnorviaBuiltinProviderConfigSourceOptions,
): NodeKnorviaBuiltinProviderConfigSource {
  return new NodeKnorviaBuiltinProviderConfigSource(options);
}

type ReleaseCandidate = {
  release?: KnorviaBuiltinRelease;
  error?: unknown;
} | null;

async function readReleaseCandidate(filePath: string): Promise<ReleaseCandidate> {
  try {
    const text = await readFile(filePath, "utf8");
    return { release: decodeKnorviaBuiltinRelease(JSON.parse(text)) };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    return { error };
  }
}

function selectReleaseCandidate(
  bundled: ReleaseCandidate,
  active: ReleaseCandidate,
): KnorviaBuiltinRelease {
  if (
    bundled?.release &&
    active?.release &&
    bundled.release.revision === active.release.revision &&
    serializeKnorviaBuiltinRelease(bundled.release) !==
      serializeKnorviaBuiltinRelease(active.release)
  ) {
    return bundled.release;
  }
  const releases = [bundled?.release, active?.release].filter(
    (release): release is KnorviaBuiltinRelease => release !== undefined,
  );
  const first = releases[0];
  if (first === undefined) {
    throw new AggregateError(
      [bundled?.error, active?.error].filter((error) => error !== undefined),
      "Bundled 与 Active Knorvia Studio Built-in Release 均不可用",
    );
  }
  let selected = first;
  for (const release of releases.slice(1)) {
    if (release.revision > selected.revision) {
      selected = release;
    }
  }
  return selected;
}

function releaseSignature(release: KnorviaBuiltinRelease): string {
  return `${release.revision}:${serializeKnorviaBuiltinRelease(release)}`;
}

function createLayerSnapshot(
  release: KnorviaBuiltinRelease,
  sourceKey: string,
): ProviderConfigLayerSnapshot {
  return Object.freeze({
    revision: `builtin:${release.revision}:${sourceKey}`,
    providers: release.config.providers,
    providerTemplates: release.config.providerTemplates,
    models: release.config.modelConfigRules,
  });
}
