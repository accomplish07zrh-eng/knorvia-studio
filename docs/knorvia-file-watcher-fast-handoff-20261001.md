# Lane C file watcher handoff — 2026-10-01

Branch: `parallel/file-watcher-fast-20261001`. Exact starting commit:
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`, fetched from
`recovery/independent-logging-20260930-0456`. Root alone owns integration.

## Pre-implementation checkpoint

Freshness passed (`ahead 65 / behind 0` relative to the checkout's fetched `origin/main`;
new branch had no upstream). Changed architecture check passed: 0 violations, 0 baseline,
0 new. Generated `services` context identifies the module as legacy/unmanaged and has no
module contract or direct dependency contracts. Public watcher contract and the shared
`FileWatchEvent` shape, UI workspace-tree and saved-workflow hooks, service registration,
remote host registration and client RPC proxy references were read before replacement.

No existing dedicated watcher tests were found. The newly frozen inherited-contract suite
ran with Node 24.14.0 and passed **13/13**, with zero failures/skips. It freezes registration
IDs/options, admission errors, coalescing and debounce, platform resolution, subscription
ordering/disposal, reentrant events, native error retirement, diagnostics, reuse and
service-instance isolation. It also exercises real `ProxyChannel.fromService/toService`
dynamic subscription consumers. Before implementation the separate five IO-port tests
failed **0/5 passed** because inherited factory ignores the proposed runtime port and
attempts native admission; these are new boundary failures, not inherited regressions.

Baseline source and current inventory were inspected. Both owned files are
`upstream-modified`, `review: null`, `NOASSERTION`, with Apache-2.0 default scope:

| Path                    | Baseline SHA-256                                                   | Fixed upstream blob                        |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `fileWatcher.ts`        | `54c14389ba3c3a13d5e9e11b5b967cec4d57768adb0e85fe59d63d027ea24bac` | `4f4808dfbac73bfa11e5e4d35c8a2b6e420888f0` |
| `fileWatcherService.ts` | `91d4176925584a123cdd48359cbcc015533dd5a4b0bf11a9e5e7401e2406c97c` | `3a625f1a645a0a93fda2125fef7a9a4a7e046c73` |

The author is source-exposed; this is not clean-room work. The public interface and
descriptor are deliberately retained. A modified/unreviewed classification is not proof
that every declaration requires rewriting. No copied implementation, blanket original
claim, or whole-file MIT conclusion is asserted. Root must review final source and digests
before regenerating shared provenance. LICENSE, NOTICE, preview identity, shared licensing
files and all **27 unresolved material obligations** remain untouched.

Spec: [watcher boundary](../specs/knorvia-file-watcher-fast-20261001.md).
Final implementation, validation and remaining platform scope follow below.
