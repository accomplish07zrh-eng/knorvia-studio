# Expert workflow context owner

Replace complete expert/runtime-context.ts only. runtime.ts can consume the same
public class/API independently and remains unchanged. This context is the single
per-instance owner of captured ports, normalized definition, snapshot projections,
journal/callback delivery and active run abort controllers. No new state layer.

```text
constructor -> schema/map -> captured ports
caller snapshot -> immutable projection -> caller-owned write/publication
journal append -> optional callback (same event)
registration -> keyed abort controller -> forwarding listener -> identity-safe dispose
```

Preserve initialization/read order, receivers, shared session/phase/graph references,
field order, native async/no-op settlement, partial append/callback errors and stale
registration disposal. Fixed API/protocol/prose remains. Core lifecycle, parser,
phase/scheduler owners and E's node/publication scope remain untouched.

Functional/API/dependency packet and exact predecessor source/JS/declaration precede
fresh no-context drafting; save/hash draft before curator comparison. Curator source
exposure and discretionary resemblance stay disclosed, with no licence classification.
Ordinary tests/builds skipped; narrow type/API checks are sufficient unless a concrete
publication/resource defect justifies a minimal synthetic safety proof. Current
emitted artifacts are deferred when not required; historical code cannot be labeled
current. Continue same branch/PR11 with no cross-lane merge or settings changes.
