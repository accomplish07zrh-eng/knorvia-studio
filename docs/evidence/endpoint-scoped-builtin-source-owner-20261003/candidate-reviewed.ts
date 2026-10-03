import type { ProviderConfigLayerSnapshot, ProviderSource } from "@knorvia/provider";
import {
  normalizeKnorviaBuiltinEndpointOrigin,
  resolveKnorviaBuiltinCachePaths,
} from "./builtin-cache-paths.js";
import { NodeKnorviaBuiltinProviderConfigSource } from "./builtin-provider-config-source.js";
import {
  KnorviaBuiltinRemoteSynchronizer,
  type KnorviaBuiltinRefreshResult,
  type KnorviaBuiltinRemoteSynchronizerOptions,
} from "./builtin-remote-synchronizer.js";

export interface EndpointScopedKnorviaBuiltinSourceOptions {
  readonly bundledFilePath: string;
  readonly environmentConfigRoot: string;
  readonly platform: string;
  readonly appVersion: string;
  readonly resolveEndpointOrigin: () => string | Promise<string>;
  readonly fetchRelease: KnorviaBuiltinRemoteSynchronizerOptions["fetchRelease"];
  readonly onRefreshResult?: KnorviaBuiltinRemoteSynchronizerOptions["onRefreshResult"];
  readonly watch?: boolean;
}

type EndpointResources = {
  readonly activeFilePath: string;
  readonly source: NodeKnorviaBuiltinProviderConfigSource;
  readonly synchronizer: KnorviaBuiltinRemoteSynchronizer;
  readonly sourceDispose: () => void;
};

function releaseResources(resources: EndpointResources): void {
  resources.sourceDispose();
  resources.synchronizer.dispose();
  resources.source.dispose();
}

export class EndpointScopedKnorviaBuiltinSource
  implements ProviderSource<ProviderConfigLayerSnapshot>
{
  readonly #options: EndpointScopedKnorviaBuiltinSourceOptions;
  readonly #listeners = new Set<(reason: string) => void>();
  #current: EndpointResources | null = null;
  #initialization: Promise<EndpointResources> | null = null;
  #disposed = false;

  constructor(options: EndpointScopedKnorviaBuiltinSourceOptions) {
    this.#options = options;
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    const resources = await this.#obtainResources();
    return resources.source.read();
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#assertAvailable();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async refresh(options?: { readonly force?: boolean }): Promise<KnorviaBuiltinRefreshResult> {
    const resources = await this.#obtainResources();
    return resources.synchronizer.refresh(options);
  }

  async resolveActiveFilePath(): Promise<string> {
    const resources = await this.#obtainResources();
    return resources.activeFilePath;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#current !== null) releaseResources(this.#current);
    this.#current = null;
    this.#listeners.clear();
  }

  #assertAvailable(): void {
    if (this.#disposed) {
      throw new Error("EndpointScopedKnorviaBuiltinSource 已 dispose");
    }
  }

  #announce(reason: string): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) listener(reason);
  }

  async #obtainResources(): Promise<EndpointResources> {
    this.#assertAvailable();
    if (this.#initialization !== null) return this.#initialization;

    // 保留原 resolver 同步重入窗口：先启动选择，再公开共享句柄。
    const selected = this.#selectResources();
    let operation!: Promise<EndpointResources>;
    operation = selected.then(
      (resources) => {
        this.#finishInitialization(operation);
        return resources;
      },
      (error: unknown) => {
        this.#finishInitialization(operation);
        throw error;
      },
    );
    this.#initialization = operation;
    return operation;
  }

  #finishInitialization(operation: Promise<EndpointResources>): void {
    if (this.#initialization === operation) this.#initialization = null;
  }

  async #selectResources(): Promise<EndpointResources> {
    const origin = normalizeKnorviaBuiltinEndpointOrigin(
      await this.#options.resolveEndpointOrigin(),
    );
    const paths = resolveKnorviaBuiltinCachePaths({
      environmentConfigRoot: this.#options.environmentConfigRoot,
      platform: this.#options.platform,
      appVersion: this.#options.appVersion,
      knorviaEndpointOrigin: origin,
    });

    if (this.#current !== null && this.#current.activeFilePath === paths.activeFilePath) {
      return this.#current;
    }

    const source = new NodeKnorviaBuiltinProviderConfigSource({
      bundledFilePath: this.#options.bundledFilePath,
      activeFilePath: paths.activeFilePath,
      watch: this.#options.watch,
    });
    const sourceDispose = source.onDidChange((reason) => this.#announce(reason));
    const synchronizer = new KnorviaBuiltinRemoteSynchronizer({
      source,
      controlFilePath: paths.controlFilePath,
      resolveEndpointKey: async () => normalizeKnorviaBuiltinEndpointOrigin(
        await this.#options.resolveEndpointOrigin(),
      ),
      fetchRelease: this.#options.fetchRelease,
      onRefreshResult: this.#options.onRefreshResult,
    });
    const resources: EndpointResources = {
      activeFilePath: paths.activeFilePath,
      source,
      synchronizer,
      sourceDispose,
    };

    try {
      await source.read();
      this.#assertAvailable();
    } catch (error) {
      sourceDispose();
      synchronizer.dispose();
      source.dispose();
      throw error;
    }

    const previous = this.#current;
    this.#current = resources;
    if (previous !== null) {
      releaseResources(previous);
      this.#announce("endpoint-changed");
    }
    return resources;
  }
}
