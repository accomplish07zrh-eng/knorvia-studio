# Third-party material evidence — 2026-10-02

This lane prepares component-scoped material for the parent audit. It closes **zero of the parent's 21 complete obligations**. It supplies two missing FreeType subcomponent notices and FreeType's license-scope overview; the Skia audit remains open. Exact URLs, source/package/member digests, scope limitations and preserved failures are in [the evidence record](../licensing/evidence/material-closure-20261002.json).

Repository: `accomplish07zrh-eng/knorvia-studio`. Branch: `parallel/material-closure-fast-20261002`. Published baseline: `main@bd0bb014c0974334557fa51814709d0b78f35f1d`. The saved cloud environment was used throughout.

## Material ready for integration

The publisher metadata for canvas 0.1.100 and all eight native platform packages identifies source revision `db337893b9b53483050ca7b24c6d306e4da06741`. Its Skia gitlink is `fe2718df5f53a681087be6f0539045ca1b4b8c09`. Skia's retained DEPS pins FreeType `264b5fbf5b912b39f98d038bf75d39be0a73f21b`.

The canvas build recipe selects bundled FreeType and zlib. Skia's FreeType source list includes `ftbase.c`, which includes `fthash.c`, and `ftgzip.c`, which includes bundled zlib when system zlib is disabled. This establishes a source-build chain; it does not certify per-platform binary linkage.

| Material | Supplied snapshot SHA-256 | Reason |
| --- | --- | --- |
| FreeType `LICENSE.TXT` | `bd36c8b474855fa294c2ec5c184544478ef3720aad37d65a6296a4f264fd2d3b` | Its scope explicitly identifies separately licensed hashing and gzip code. |
| `fthash.c` original MIT comment | `5285d96f6aa3188193d5fbefd8710ed6a46af185e0a43817c17acee5f4b1ab3d` | Preserves Computing Research Labs/New Mexico State University and Francesco Zappa Nardelli attribution, absent from existing snapshots. |
| FreeType's bundled zlib 1.3.1 original comment | `02421fcfbfb1d656ef0b6ff4cd3c39f2946f08c3219fa42db482add7ce1f53ea` | Existing Skia zlib evidence describes the separate 1.2.12 copy. Preserve both. |

Each snapshot is `third-party/upstream/<SHA-256>.txt`. The two comments are extracted verbatim, including the original permission and warranty text. The overview is retained in full.

The parent can append `skia.noticeAdditions` from the evidence record to the existing Skia notice record in `third-party/embedded-components.json`, then regenerate the target distribution's notices. Keep `Skia.reviewRequired`: full nested attribution and platform linkage are still unresolved. This lane leaves the global manifests, generated notices and licensing decisions unchanged.

## Remaining obligations and scope findings

| Obligation | Finding | What remains |
| --- | --- | --- |
| Three ARMS packages | Exact archives: `@arms/rum-browser@0.1.8`, `@arms/rum-core@0.1.4`, `@arms/rum-electron@0.0.3`. Metadata has no publisher repository; archives have no full component notice. All three are absent from this baseline's current manifests and lockfile, but remain in the historical notice inventory. | Parent must reconcile the target artifact graph before retiring these packages from its scope. A distribution containing them still lacks original material. |
| Five utility packages | `is-node-process@1.2.0`, `strict-event-emitter@0.5.1`, `lazy-val@1.0.5`, `semaphore@1.1.0`, `unsafe-pointer@0.2.0`: exact archives and source package versions confirmed. No full notice found in the archives or the pinned, nontruncated publisher trees. | Applicable original copyright/permission material or a project decision; author metadata is not a replacement notice. |
| QuickJS-WASI wrapper | [Publisher PR 51](https://github.com/vercel-labs/quickjs-wasi/pull/51) added an MIT notice. Its [maintainer confirmation](https://github.com/vercel-labs/quickjs-wasi/pull/51#issuecomment-5710526252) explicitly covers **3.6.0** at `54c4d2dd…`; this repository retains **2.2.0** at `cc1fea4a…`. | No version-specific 2.2.0 notice coverage established. Do not extrapolate the 3.6.0 confirmation. |
| QuickJS/WASI/extensions | Exact 2.2.0 tarball and all seven WASM/native members hashed. Its Makefile requires WASI SDK 32. Existing notices remain applicable; the package provides no npm provenance attestation. | Exact linked material/sysroot provenance remains open; a source recipe alone is not a reproducible-binary result. |
| React Best Practices | Version declaration 1.0.0; pinned publisher tree has no full notice. MIT declarations and the author's existing attribution remain retained. [Publisher issue 230](https://github.com/vercel-labs/agent-skills/issues/230) and [issue 249](https://github.com/vercel-labs/agent-skills/issues/249) document the missing file. Local formatting prevents most files from byte-matching the reference. | Full applicable publisher notice and import provenance; unmerged contributor proposals do not establish a publisher grant. |
| Eight colored provider SVGs | Bound exact paths/digests for BigModel, Moonshot, Z.ai/Z.ai square, both OpenCode variants and both OpenRouter variants. Parent's previous negative publisher-grant searches were not repeated. | Applicable asset grants. Black/white authorship evidence does not clear these files. |
| Rust `6a6eaca…` | Both checked-in Windows ripgrep 14.1.1 archives match their inventory hashes; both executables contain the full unresolved Rust source revision. The two unavailable legacy Windows ripgrep 13 archives are not selected by the current remote planner: Windows remote targets are unsupported, Darwin selects 13, Linux selects 14. | Exact notice for the current Windows binaries still missing. Parent can reassess whether legacy Windows material belongs in the target release scope. Previous failed revision lookup was not repeated. |
| Skia | Nine exact canvas package archives match registry digests and the lockfile. Two specific missing subcomponent notices supplied above. | Complete platform/nested attribution audit remains open. |

No publisher was contacted, no agreement accepted, no asset rewritten, and no private Library or root file restriction bypassed. The already closed boolbase, scroll-bar, deferred-promise, Hono and ANSI obligations were not revisited.

## Checks and limits

- Freshness and published baseline verification passed. Baseline provenance check passed with 8,336 files and zero review problems; it proves report freshness, not full source/material closure.
- All 18 downloaded npm archives match registry SHA-512 integrity and SHA-1 shasum. All 15 that exist in the current lockfile match its integrity; the three ARMS versions are absent.
- All 18 checked-in native archives match the existing inventory. Rust revision inspection and six remote-planner target checks are recorded in the evidence.
- Baseline verified-notice checking failed with `ENOENT` for the obsolete `apps/zcode-cli/package.json` input. The committed empty `reviewRequired` arrays in published main/continuation are therefore not evidence that the parent's obligations have closed.
- Source-fetch failures are preserved: no `v2.2.0` QuickJS-WASI tag; FreeType's overview is at root `LICENSE.TXT`, not `docs/LICENSE.TXT`.
- Global provenance/notice inventories need refreshing by the integrating parent after these new evidence files are added. Product dependencies were not installed, and product tests were not run for this evidence-only task.
