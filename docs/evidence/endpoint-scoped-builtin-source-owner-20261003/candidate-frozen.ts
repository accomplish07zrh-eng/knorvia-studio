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
  private readonly options: EndpointScopedKnorviaBuiltinSourceOptions;
  private readonly listeners = new Set<(reason: string) => void>();
  private current: EndpointResources | null = null;
  private initialization: Promise<EndpointResources> | null = null;
  private disposed = false;

  constructor(options: EndpointScopedKnorviaBuiltinSourceOptions) {
    this.options = options;
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    const resources = await this.obtainResources();
    return resources.source.read();
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.assertAvailable();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(options?: { readonly force?: boolean }): Promise<KnorviaBuiltinRefreshResult> {
    const resources = await this.obtainResources();
    return resources.synchronizer.refresh(options);
  }

  async resolveActiveFilePath(): Promise<string> {
    const resources = await this.obtainResources();
    return resources.activeFilePath;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.current !== null) releaseResources(this.current);
    this.current = null;
    this.listeners.clear();
  }

  private assertAvailable(): void {
    if (this.disposed) {
      throw new Error("EndpointScopedKnorviaBuiltinSource 已 dispose");
    }
  }

  private announce(reason: string): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(reason);
  }

  private obtainResources(): Promise<EndpointResources> {
    this.assertAvailable();
    if (this.initialization !== null) return this.initialization;

    let fulfill!: (resources: EndpointResources) => void;
    let reject!: (error: unknown) => void;
    const operation = new Promise<EndpointResources>((resolve, rejectOperation) => {
      fulfill = resolve;
      reject = rejectOperation;
    });

    // Publish the joinable handle before calling the caller-supplied resolver.
    this.initialization = operation;
    this.selectResources().then(
      (resources) => {
        if (this.initialization === operation) this.initialization = null;
        fulfill(resources);
      },
      (error: unknown) => {
        if (this.initialization === operation) this.initialization = null;
        reject(error);
      },
    );
    return operation;
  }

  private async selectResources(): Promise<EndpointResources> {
    const origin = normalizeKnorviaBuiltinEndpointOrigin(
      await this.options.resolveEndpointOrigin(),
    );
    const paths = resolveKnorviaBuiltinCachePaths({
      environmentConfigRoot: this.options.environmentConfigRoot,
      platform: this.options.platform,
      appVersion: this.options.appVersion,
      knorviaEndpointOrigin: origin,
    });

    if (this.current !== null && this.current.activeFilePath === paths.activeFilePath) {
      return this.current;
    }

    const source = new NodeKnorviaBuiltinProviderConfigSource({
      bundledFilePath: this.options.bundledFilePath,
      activeFilePath: paths.activeFilePath,
      watch: this.options.watch,
    });
    const sourceDispose = source.onDidChange((reason) => this.announce(reason));
    const synchronizer = new KnorviaBuiltinRemoteSynchronizer({
      source,
      controlFilePath: paths.controlFilePath,
      resolveEndpointKey: async () => normalizeKnorviaBuiltinEndpointOrigin(
        await this.options.resolveEndpointOrigin(),
      ),
      fetchRelease: this.options.fetchRelease,
      onRefreshResult: this.options.onRefreshResult,
    });
    const resources: EndpointResources = {
      activeFilePath: paths.activeFilePath,
      source,
      synchronizer,
      sourceDispose,
    };

    try {
      await source.read();
      this.assertAvailable();
    } catch (error) {
      sourceDispose();
      synchronizer.dispose();
      source.dispose();
      throw error;
    }

    const previous = this.current;
    this.current = resources;
    if (previous !== null) {
      releaseResources(previous);
      this.announce("endpoint-changed");
    }
    return resources;
  }
}
