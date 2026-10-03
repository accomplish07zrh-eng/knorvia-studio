import type { ProviderConfigLayerSnapshot, ProviderSource } from "@knorvia/provider";
import type { KnorviaBuiltinRefreshResult, KnorviaBuiltinRemoteSynchronizerOptions } from "./builtin-remote-synchronizer.js";

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

export declare class EndpointScopedKnorviaBuiltinSource implements ProviderSource<ProviderConfigLayerSnapshot> {
  constructor(options: EndpointScopedKnorviaBuiltinSourceOptions);
  read(): Promise<ProviderConfigLayerSnapshot>;
  onDidChange(listener: (reason: string) => void): () => void;
  refresh(options?: { readonly force?: boolean }): Promise<KnorviaBuiltinRefreshResult>;
  resolveActiveFilePath(): Promise<string>;
  dispose(): void;
}
