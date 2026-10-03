# Skia / HarfBuzz nested notice additions — 2026-10-02

This is a component-scoped evidence addition for the existing `@napi-rs/canvas@0.1.100` → Skia `fe2718df5f53a681087be6f0539045ca1b4b8c09` → HarfBuzz `9cb1fee51069b206effb4736e443b038d230789d` source chain. It clears **zero whole parent material obligations**. Global manifests, generated notices, runtime code and licensing decisions are unchanged.

Four previously missing original notice texts are ready for parent integration:

| Material | Exact notice / provenance |
| --- | --- |
| Tan fasthash code in `hb-algs.hh` | Complete embedded MIT comment, © 2012 Zilong Tan. |
| UCD implementation in `hb-ucd.cc` | Complete embedded ISC comment, © 2012 Grigori Goronzy. |
| kurbo `solve_itp` adaptation in `hb-algs.hh` | Original MIT notice, © 2018 Raph Levien, at the explicitly referenced commit `fd839c25ea0c98576c7ce5789305822675a89938`. Its original Apache alternative exactly matches an existing snapshot and is reused. Both publisher texts are retained without choosing a global license. |
| Microsoft USE shaping data | Full `src/ms-use/COPYING` from the pinned HarfBuzz tree. The pinned generation recipe locates three inputs in `src/ms-use`: two category overrides and invalid-cluster data; their generated USE table and vowel constraints are listed by Skia. |

All 344 literal HarfBuzz source references in the pinned Skia profile matched the nontruncated publisher Git tree. The kurbo source, package metadata and both license files also matched their exact tree blobs. The exact kurbo commit declares version `0.9.0`; the adaptation comment's separate documentation link says `0.8.1`. The immutable source reference controls this record.

[The evidence record](../licensing/evidence/skia-harfbuzz-nested-notices-20261002.json) contains raw SHA-256 and Git blob bindings, complete extraction ranges, source links and the five scoped integration entries. Four new snapshots were added; the Apache snapshot already exists.

Keep every previous notice and the Skia review flag. Source-list inclusion does not prove final per-platform linkage or that a routine survives linking. Unicode 17 generated data, fontTools ports without an exact origin revision, transitive includes/generator inputs and native binary linkage remain separate evidence boundaries. The nonexistent legacy `src/Makefile.sources` lookup is preserved; the exact `src/update-unicode-tables.make` was retrieved instead. The initial assumption that Meson located these inputs was corrected before commit.
