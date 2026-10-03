export interface RemoteAssetNetworkPort {
  fetch: typeof globalThis.fetch;
}

export function resolveRemoteAssetFetch(
  network: RemoteAssetNetworkPort | undefined,
): typeof globalThis.fetch {
  return network?.fetch ?? globalThis.fetch.bind(globalThis);
}
