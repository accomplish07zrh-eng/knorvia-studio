export interface RemoteAssetNetworkPort {
    fetch: typeof globalThis.fetch;
}
export declare function resolveRemoteAssetFetch(network: RemoteAssetNetworkPort | undefined): typeof globalThis.fetch;
