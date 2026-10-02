# Model request and tool-batch ownership

A owns complete `methods/model.ts` and `methods/turn-tools.ts`, with private modules only as needed for the 400-line boundary. The request owner captures execution model selection, assembles a projected request and consumes one model response. The tool-batch owner declares durable parts, delegates scheduling/execution to unchanged authority ports, publishes every admitted result and determines the existing continuation. No permission, cache, runtime state, memory/media, queue or adapter subsystem is reconstructed.

```text
request → existing projection/usage ports → model handle → stream owner → existing event queue → result
model tool declarations → durable pending parts → existing executor → ordered result publication → turn continuation
```

Public signatures, supported identity/order, effect counts, native await boundaries, error/abort delivery, persisted field order and runtime strings are frozen from current source plus actual compiler JS/declarations. Body-free packets describe observable obligations and public ports, not private decomposition. Initial drafts are sealed before curator comparison; all revisions remain immutable evidence. Curator has source exposure. Similarity and source acceptance remain independent review questions.

Minimum owned fake-port checks address model-call authority propagation and tool-result persistence/cancellation closure; ordinary behavior suites, full builds, native acceptance and neighboring real runtime execution are deferred under the speed-first instruction. No live data/provider/filesystem execution. Freshness fetch is blocked by the configured proxy; local execution works.
