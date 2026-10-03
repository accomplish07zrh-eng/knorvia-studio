# Phase artifact graph publication

Own only `workflow/expert/graph-artifacts.ts`: the two public artifact entrypoints
and their complete graph-journal publication lifetime. The actual agent-phase
caller is `continueRun` in `expert/run-loop.ts`, which awaits seed publication,
then prompt updates, before publishing its returned snapshot. Existing parsers,
ID formatting, lifecycle transformations, context, graph boundaries and planner
implementations stay unchanged. The curator has read predecessor source; inventory
records upstream-modified/unreviewed, publisher blob abd7b0b830836043f324d1e78517ca84bdffb5cc.

```text
response + definition -> existing parser/lifecycle -> accepted snapshot
                        -> awaited snapshot write
                        -> ordered journal publication -> awaited event -> return
```

The owner adds no abort admission, rollback, retry, validation or storage policy.
No-op paths return the original reference through their native async boundary.
Dependency/port errors reject unchanged, with prior effects intact. Preserve
method receivers, signal identity, clocks, record/event field order/presence,
shared graph-member references and values read after each await. Seed journal
publication has an additional native promise boundary before its terminal event;
prompt publication does not. Never precompute values that ports may mutate before
later publication. Concurrent calls have independent local state.

Freeze compact direct observations and the actual compiled run-loop consumer with
owned phase/context ports. Current source and strict compiler output must be bound,
as must historical source/JS/declaration and selected private dependencies. The
consumer uses real run-loop code with synthetic phase execution; unused runtime
paths are guarded stubs, not provider calls. Preserve no-op, representative gated
seed/collection, prompt, errors/partial writes, late mutation and settlement facts.

Give one fresh no-context author only the functional contract and minimal type/port
packet after freeze. Save and hash its draft before curator comparison. This is an
instruction-bounded shared-filesystem workflow, not clean-room isolation. Attribute
retained APIs, runtime prose and conventional expression honestly. A full-owner
candidate still requires root's independent contribution/rights review.

Only focused owner/direct-consumer tests and scoped compiler/lint/format/architecture.
No aggregate suite/build, real workflow/provider/user IO, environment change,
licence/header/inventory grant, or root publication retry.
