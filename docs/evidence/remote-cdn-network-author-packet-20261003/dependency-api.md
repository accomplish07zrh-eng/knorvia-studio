# Existing public dependencies

- `node:path` public named export `posix`, whose `normalize(path: string): string` uses Node POSIX path semantics. Only normalization is needed; do not reconstruct its implementation.
- Native JS/Node `URL`, `encodeURIComponent`, `decodeURIComponent`, ordinary `Error`, ordered exact-string `Set`, strings/arrays and native function `bind` are public runtime surfaces.
- `globalThis.fetch` has the existing runtime fetch type. `RemoteAssetNetworkPort.fetch` uses that exact type. The owner only selects/binds it; no calls or transport implementation are needed.
- No project implementation helper is provided/required. Both owner public surfaces are complete in the separate declaration inputs; private decomposition is unconstrained.

Pinned execution environment Node24.19.0; declaration extraction uses already available TypeScript6.0.2. No schema/publisher/network lookup/test body is an input. No runtime tests/builds/compiler project checks were run for this packet.
