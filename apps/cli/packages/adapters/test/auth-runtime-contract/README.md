# Auth runtime regression

The source and emitted test groups each run the same 30 independent behavior cases. The cases were frozen before candidate acceptance; permanent integration changes the coordinator and portability, not their behavior assertions or deadlines. Each case uses an allowlisted environment, owned temporary files, a fake OS/HTTP port, and an injected browser child. No real user credentials, browser, listener, provider request, or live service is used.

The runner checks actual source and emitted graph inputs separately. Missing emitted modules fail without a source fallback. Strict auth type comparison uses the actual five emitted declarations and a projection of the real adapters root's auth re-export. Other root exports are explicitly excluded from this narrow compiler program and recorded in the API graph; the full CLI typecheck separately covers the complete package. This projection does not replace actual auth declarations with expected fixtures.

Failures retain raw streams, per-case receipts, graph inputs, API evidence and owned work directories. Successful groups clean only their verified temporary paths. The loader/owned ports are test controls, not an operating-system sandbox.

Authored cases and harness code use MIT. Files under `retained-contract` are retained public compatibility declarations under Apache-2.0 and are not claimed as independently authored implementation. The root license and third-party notices continue to apply to their respective inputs.
