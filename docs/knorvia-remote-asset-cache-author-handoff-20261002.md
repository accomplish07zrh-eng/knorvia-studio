# Root sixth-lane remote asset cache author packet

Frozen input commit: `ac7bcbde`. Root owns the replacement implementation personally; E only curated this packet. No cross-lane implementation has been integrated.

Read only these author-facing files before freezing the complete draft:

1. [Contract](evidence/remote-asset-cache-author-packet-20261002/contract.md): public behavior, parsing, reference semantics, path/cache identities, request sharing, refresh/pinned manifest rules, download and migration gates, filesystem commit/rollback and progress/marker behavior.
2. [Exact public declarations](evidence/remote-asset-cache-author-packet-20261002/public-api.d.ts): all eleven exported functions and five interfaces; no implementation or inherited commentary.
3. [Required dependency signatures](evidence/remote-asset-cache-author-packet-20261002/dependency-signatures.d.ts): existing collaborators to import, not implement.
4. [Observable messages](evidence/remote-asset-cache-author-packet-20261002/messages.md): required error/log strings and interpolation semantics, without implementation bodies.

The [curator manifest](evidence/remote-asset-cache-author-packet-20261002/curator-manifest.json) separately binds source and input byte lengths/digests. Curator read the inherited owner and bounded dependencies; this is source-derived behavioral distillation, not a specification claimed to predate source exposure. No inherited function/test body or explanatory commentary is included in author inputs. No remote-cache implementation was authored in this lane.

| Input                      |  Bytes | SHA-256                                                            |
| -------------------------- | -----: | ------------------------------------------------------------------ |
| contract.md                | 23,131 | `75a5c9e20f1d1367b5020ee6d7bd865c20b235891f1bf14bf4709833643abb6f` |
| public-api.d.ts            |  2,494 | `794a92db2912410a8747f377512312e75a2cf1e65f6ded1863f9342edc860fda` |
| dependency-signatures.d.ts |  1,346 | `f3d68a951adbcb7224cf9c5eb81880f1771437e93209fbf784db276ff373783d` |
| messages.md                |  6,180 | `58c09d25918cd6f8fc4c6fac3c6c4eff9fa751dbb383cde64ce1e2ae996a0c42` |

Source baseline is published E `674370592f06ac69996dbac08b3c0f4210983f61`; owner SHA-256 `28d4d2f5d323c49a866832f3233df4dbdfff5cf4c9ec145586077c44a06ced98`, Git blob `99a6c17f195880e9e660e86be5aebedc2ca39e35`, 64,276 bytes. Declarations were extracted with TypeScript 6.0.2 and comments removed. Isolated declaration diagnostic 9011 about an inferred numeric default parameter is recorded; emitted timeoutMs?: number agrees with that default. The first attempt to serialize the diagnostic failed on a circular compiler object; no artifact from that failed attempt was used. Neither issue is represented as a passing project typecheck.

No runtime tests, project checks, broad builds or material-source network requests ran. The packet explicitly preserves known compatibility limits rather than silently improving them. Root should freeze the complete draft plus exact input/output hashes and read receipt before source/test review. Ordinary E evidence publication is authorized; the cancelled root source-tree upload remains untouched.

## Root author context qualification

Root reports that the target implementation bodies, history and tests have not been presented to its author context before drafting. Root nevertheless has broad project history, and earlier generic repository scanners may have processed filesystem bytes. Do not describe root as a fresh-context or OS-isolated clean-room author. The boundary is the stated target-material context restriction, not an assertion of zero prior repository exposure. Keep the target implementation out of root's author context until the complete draft is frozen. This qualification does not alter the frozen packet bytes or their digests.
