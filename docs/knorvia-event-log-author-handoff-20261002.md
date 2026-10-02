# Complete scheduler event-log author handoff

The [frozen behavior/API packet](evidence/event-log-author-packet-20261002/) covers the complete `WorkflowSchedulerEventLog` owner: construction/callback capture, synchronous timestamps, graph status/collection/expansion records, event publication and optional observer settlement. This batch produces an uninstalled author candidate, not accepted runtime integration.

## Contract and input freeze

Commit `1e6b6d41` freezes the three author inputs and their curator manifest before creating the new author. The behavior source is published E checkpoint `3d8c4fda78de6583851d0d69bd1d712060b1ac98`; `scheduler/events.ts` is unchanged at both corrected `39cc7b5` and module-boundary `0cca0d48`. Its SHA-256 is `4acf40908ead0d823de81c910c18928dc11a28cd87ca13da1c106a4e5947812d`, Git blob `90776ca16e1704c6c01ef4fdcb7db1ab52c8821e`.

The key order is explicit: every graph append reads the outer routing runId before record construction; the record's runId is also read before the mutation-capable clock. Later records read current snapshot values anew. For event publication, event metadata precedes the clock while options.signal is read afterward. The packet also records live expansion-array traversal, current post-publication summaries, reference sharing, callback receivers, public timestamp/collection-method dispatch, sequential gates, rejection identity and absence of cancellation policy.

| Author input | Bytes | SHA-256 |
| --- | ---: | --- |
| contract.md | 13,647 | `ce4463a056fd19af8f34d7cfc61edc95fa449b4d9757f32868700bd0f92bab91` |
| public-api.d.ts | 3,121 | `7fee633393fd228aabf9057efe3d74ebd93d234b38ee50d240d76d6173a1fc33` |
| public-data-shapes.md | 6,082 | `b77596c0b62b857849836bb7c84ae4dfc67bca75230b6e0c0dccefb3cc738e44` |

The class declaration uses the earlier exact-source TypeScript emit, omitting private members so the author is free to choose internal storage. Dependency signatures and exact public data schemas provide bindings; no implementation/test bodies or private layout are supplied. Fixed protocol expression and ordered observations are compatibility constraints, not new algorithms.

The initial freeze's whitespace check reported a trailing blank line at the end of the public-schema reference. That harmless finding is preserved with the exact input bytes instead of silently rewriting the frozen packet.

## Author boundary

A new native task `/root/event_log_packet_author` was created with no inherited conversation (`fork_turns: none`), GPT-6 Astra/high, in this same executor. Neither the collection nor expansion author was reused. The native tool has no separate Fast/service-tier setting. The [exact invocation](evidence/event-log-author-packet-20261002/author-invocation.txt) limits reads to the three copied inputs and its own outputs and requires hash/read receipts before curator comparison.

The curator is source-exposed. This is a functional/public-API distillation from existing source, not a source-unexposed specification. Author access restrictions are instruction-based in a shared executor, not independent filesystem isolation or an audited access-control guarantee. Whole-owner contribution assessment, source-expression comparison, type checks and real-consumer acceptance remain subsequent work.

## Frozen author output

The author froze the complete [draft](evidence/event-log-author-packet-20261002/draft-events.ts.txt) at `2026-10-02T16:36:53.365697Z`. The curator archived its exact bytes at `2026-10-02T16:37:44.510969+00:00`, before reading the draft body, comparing source or running checks. The [archive manifest](evidence/event-log-author-packet-20261002/curator-draft-manifest.json) binds the frozen input commit and output files.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| draft-events.ts.txt | 3,724 | `c5cee5930fac8cf66616fc9e3ba165bb9a8d6ad829c135ae223e1615e00b6174` |
| author-record.json | 2,141 | `02bdbce4cc3cd7a98432380ab6ef35e92969813b3a7c76221ac3fcb15c077a9a` |

The [author receipt](evidence/event-log-author-packet-20261002/author-record.json) reports reads limited to the three inputs and its own output, no boundary breaches or unresolved questions, and no compilation, tests, comparisons, production edits or contact with other authors. These are recorded author attestations. The curator verified archive byte lengths and digests without opening the draft body. The complete draft remains unreviewed, uncompiled and untested; it is not installed in production source.

## Validation and scope

No compiler or runtime checks were run for this event-log batch, and no earlier successful probes or broad suites were repeated. The updated user cadence defers aggregate acceptance to final integration. The original event-log source remains inherited; producing this packet or a draft does not change its current source/notice relationship. Graph helpers, contract/schema bodies, callback adapters, other scheduler owners and global licensing remain outside candidate clearance.

No production file, licence/header/global inventory or fixed root publication checkpoint changed. No rate-limited material source was accessed. The cancelled root source-tree upload was not retried or rerouted; only the ordinary E evidence branch and its draft recovery PR are publication scope.

## Subsequent static review

The immutable freeze above records the state before review. A later [static review and clarified disposition](knorvia-event-log-static-review-20261002.md) found the required clock/read order preserved. Exact normalized body matches are retained as evidence; the clarification distinguishes required contract expression from ordinary wrapper idioms and identifies no concrete non-mandated copied expression. It supports a bounded author contribution, without requiring textual novelty or granting global licence clearance. The draft remains uninstalled, uncompiled and untested.
