# ARMS and legacy Windows ripgrep scope — 2026-10-02

This supplements [the material-closure report](knorvia-material-closure-20261002.md) and commit `c583205ff672ceb3471c0dba07a7c4e0009a0486`. It proposes component-scoped obligation wording for the parent; it closes **zero complete material obligations** and supplies no new license grant. Exact Git blobs, SHA-256 digests, historical snapshot bindings and selector results are in [the scope evidence](../licensing/evidence/material-scope-20261002.json).

The saved cloud checkout is `accomplish07zrh-eng/knorvia-studio`, branch `parallel/material-closure-fast-20261002`, based on published `main@bd0bb014c0974334557fa51814709d0b78f35f1d`. Remote main and this branch were verified before preparing this supplement. No runtime, global inventory, licensing decision or release was changed.

## What the available history establishes

The checkout is not shallow, but its earliest recorded commit is the 2026-09-24 preview snapshot `7619e41b950bd52073ebf36754146cf25659d9fa`. It does not contain the earlier fresh-clone/removal history described by `specs/knorvia-clean-base.md`. The audit enumerated all 205 commits reachable from the input head, including every tracked `package.json`, lockfile and workspace manifest at each tree. The 35 manifest paths contain 65 distinct package-manifest blobs; there are four lockfile blobs and two workspace-manifest blobs. None contains an ARMS package reference.

Separate bindings cover the available preview build revisions `6e1b4f27181d843b72f7e6c5a32a2f1b96562980`, `f8d1b22ba5c911bb6980d2aa4ba4bfead49af57b` and `805754face6bf038da0ddb308da1f9da508d11e0`. These are revisions declared in tracked release documents. The lane did not inspect their installer/portable bytes, and no local Git tags are present. A declaration and frozen dependency graph are evidence about intended inputs; they do not establish an artifact's contents.

## ARMS: absent dependency selection, retained source material

The three exact packages remain `@arms/rum-browser@0.1.8`, `@arms/rum-core@0.1.4` and `@arms/rum-electron@0.0.3`. All are absent from the current and available historical dependency declarations. Current `pnpm-workspace.yaml` does not apply the ARMS patch. The clean-base specification explicitly removes connections to upstream product telemetry services; the current independent-implementation specification preserves the product's functionality, UI and data. These instructions do not remove local observability or telemetry as an entire product capability.

The source tree still contains `patches/@arms__rum-electron@0.0.3.patch`, unchanged since the earliest snapshot. Its SHA-256 is `36855354851ea495bc47a03340b0484ff62836b739cad56904b8a69f18e2ae97`, matching the existing third-party patch record. Its diff preimage is Git blob `d26925cd014c42b6c6d470f9d2d4d75196203339`. The exact publisher tarball already verified in the previous audit contains `package/dist/index.mjs` with that same Git blob and SHA-256 `9dd3cc140912515886fa0b68d3d6e1b69c25f7f53f474135bc52621526666447`. This binds the retained patch to the actual Electron package, rather than a similarly named file. Its publisher package manifest pins the Browser and Core versions above; that relationship alone does not prove their code appears in the retained patch.

The desktop packaging manifest selects compiled `out/**/*`, package dependencies and explicit resources. No rule explicitly copies the root ARMS patch into the installer. This does not prove compiled bundles are free of embedded SDK material. Existing ARMS notice inventory entries are retained and do not substitute for missing original notice text.

**Proposed parent wording:** mark all three packages “not selected by the audited current/available historical manifest and lockfile graph; target artifact inclusion remains to be checked.” Keep Electron's source-material obligation open for the exact retained patch and any source delivery including its history. Keep Browser/Core notices open for any artifact or source material actually containing them. Do not retire all three obligations from the full product acceptance scope based on manifest absence, and do not assign MIT to the retained SDK material.

## Legacy Windows ripgrep: dormant checksums, active Windows product scope

The available history contains one remote-planner blob and one remote preparation-platform-list blob. Across that history, preparation targets are only `linux-arm64`, `linux-x64`, `darwin-arm64` and `darwin-x64`. The planner selects ripgrep 13 for Darwin and ripgrep 14 for Linux, and rejects Windows. Both historical native-selector blobs were evaluated without preparing or downloading assets; each produces the same ripgrep selection for all six OS/architecture pairs.

The two unavailable legacy Windows archives appear as checksum-table entries. No matching archive path occurs in the available tracked-file history. Their declared digests are:

| Legacy release / target | Declared SHA-256 |
| --- | --- |
| `v13.0.0-10 / win32-arm64` | `6c12d2c95073a4b981e5706981f42327b6359fc4cd7449ebd11f6769768dea97` |
| `v13.0.0-10 / win32-x64` | `7b35b95cf3d7f92d8fe087006899617b1b5a6dac4bbed5d4f6ace6f0934799dc` |

Windows remains part of the product: the release specification and documents declare installer/portable delivery, and the standalone CLI target manifest includes Windows arm64 and x64. Desktop packaging and the standalone CLI asset collector use the current native-search plan, selecting the checked-in Windows ripgrep **14.1.1** archives. Both executables remain bound to Rust `6a6eaca656978778f7c1c750ee0c3db87f8bffb2` by the previous evidence. Its exact notice remains missing.

**Proposed parent wording:** reclassify only the two Windows ripgrep 13 retrieval requests as “dormant checksum metadata; not selected by any audited available historical or current delivery planner.” They need not block completing material for a target whose verified source/asset manifest excludes them. Preserve their declarations and unavailable status; archived release bytes or earlier unavailable history are not cleared. Keep the current Windows ripgrep 14/Rust obligation open, and preserve full Windows functionality and distribution scope.

## Checks and remaining work

Historical manifest enumeration, exact ARMS patch/preimage binding, the 12 historical selector cases, source/member digests and document links were checked. The previous report's unavailable notices, source-fetch failures and stale global provenance/notice inputs remain recorded; unchanged failed publisher searches were not repeated. No new authoritative notice was established in this reconciliation. The two FreeType subcomponent notices prepared in `c583205` remain ready for parent integration with Skia's review still open.

The parent still needs the final target artifact graphs and applicable original notices. Any accepted scope changes belong in the parent's global review, followed by its inventory refresh. This lane leaves those files unchanged. Product builds and tests were not run for this evidence-only task.
