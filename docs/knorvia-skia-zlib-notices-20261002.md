# Pinned Skia zlib notice additions — 2026-10-02

Chromium’s missing BSD notice, the exact newer zlib header notice, and six original attribution comments are ready for component-scoped parent integration. This closes **zero complete material obligations**; Skia's per-platform linkage and complete nested attribution review remain open. Exact source URLs, Git blobs, source/snapshot SHA-256 digests and integration entries are in [the evidence record](../licensing/evidence/skia-zlib-notices-20261002.json).

Work used the existing saved cloud branch `parallel/material-closure-fast-20261002`, input head `72efa1d424c37cfd262034063b28c95a110a5c2a`. The earlier canvas package/archive evidence was reused. No runtime, global inventory, generated notice, access setting or licensing decision was changed.

## Exact source chain

Canvas `0.1.100` identifies publisher source `db337893b9b53483050ca7b24c6d306e4da06741`, whose Skia gitlink is `fe2718df5f53a681087be6f0539045ca1b4b8c09`. The retained Skia DEPS pins Chromium zlib `646b7f569718921d7d4b5b8e22572ff6c76f2596`.

The [publisher export commit](https://chromium.googlesource.com/chromium/src/third_party/zlib/+/646b7f569718921d7d4b5b8e22572ff6c76f2596) records `GitOrigin-RevId: 2f39ac8d0a414dd65c0e1d5aae38c8f97aa06ae9`. Its entire exported tree matches that exact Chromium revision's `third_party/zlib` tree: `15d5d748ce2060ea03b9e9b60d9d0ee512274520`. The [Chromium license at that origin](https://chromium.googlesource.com/chromium/src/+/2f39ac8d0a414dd65c0e1d5aae38c8f97aa06ae9/LICENSE) is Git blob `2249a28657f86c645f8978b75babc1bd52aca318`.

The selected zlib CPU/SIMD source headers explicitly point to the Chromium repository's BSD license. The existing component notice contains only the zlib root license. The origin binding supplies the exact referenced publisher text.

## Material prepared

| Original text | Snapshot SHA-256 |
| --- | --- |
| Chromium's complete BSD notice at the exact origin | `368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b` |
| Complete leading notice from pinned `zlib.h` | `df694330c5856149838d49b822ec23986329fd8413bde5e816874f0ee04d1c56` |

The pinned `zlib.h` declares version **1.3.0.1**, macro `1.3.0.1-motley`, and Gailly/Adler copyright **1995–2023**. Its root `LICENSE` still describes **1.2.12 / 1995–2022** and matches the existing retained snapshot exactly. Both original texts must remain; the publisher's literal `August xxth, 2023` date in the header is preserved. This copy is also distinct from FreeType's separately bundled zlib 1.3.1 notice already integrated by the parent.

Six separate, unmodified leading source comments preserve the checked sources' attribution: Chromium 2017 (`crc32_simd.c`), Chromium 2018 (`cpu_features.c`), Chromium 2022 (`slide_hash_simd.h`), ARM/Chromium 2017 (`chunkcopy.h`), Intel 2013 (`crc_folding.c`), and Mark Adler 1995–2017/Chromium 2023 (`inffast_chunk.c`). Their evidence entries pair each comment with the permission text its source explicitly references. No copyright holder or grant was inferred from package names.

## Selection and integration limits

The pinned canvas recipe enables PDF and requests bundled zlib. Skia defaults `skia_use_zlib=true`; its PDF target depends on `//third_party/zlib`. The bundled source list includes `cpu_features.c` directly. The source rules include the scoped SIMD code under explicit x86/x64 or ARM/ARM64 conditions. These are source-build selections. Resolved platform GN arguments, compilation/link maps and a reproduction of the published native binaries were not obtained.

The parent can append all eight `skia.noticeAdditions` entries from this record to the existing Skia notice list, then regenerate notices/provenance for its target. Preserve the existing zlib root notice and all FreeType material. Keep `Skia.reviewRequired`; this addition does not clear the rest of Skia or assign MIT to mixed material.

Checks bind the new source bodies to their pinned publisher Git blobs, confirm export/origin tree equality, verify the eight exact notice extractions and retain the earlier package evidence digest. The incorrect assumption that the standalone export commit also existed in the monorepo produced a 404; its correction through `GitOrigin-RevId`, and web-renderer failures followed by successful primary Gitiles retrievals, are preserved in the evidence. No package matrix, unchanged failed grant search or product build/test was repeated.
