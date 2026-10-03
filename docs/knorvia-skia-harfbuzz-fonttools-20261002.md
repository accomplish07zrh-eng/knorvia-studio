# fontTools notice for the pinned HarfBuzz solver port

One missing original publisher notice is ready for parent integration. The pinned HarfBuzz solver explicitly identifies an exact fontTools source origin whose Just van Rossum attribution is absent from the retained HarfBuzz notice. This closes **zero complete material obligations**; Skia's full nested attribution and binary linkage review remain open. [Exact evidence and integration entry](../licensing/evidence/skia-harfbuzz-fonttools-20261002.json).

Work used the saved cloud branch `parallel/material-closure-fast-20261002`, input head `b4e6fcb9df1ce47f959b64d6655b96bdca617ea5`. Existing canvas/archive and Skia build evidence was reused. No runtime, global inventory or licensing decision was changed.

The source chain remains canvas `0.1.100` at `db337893b9b53483050ca7b24c6d306e4da06741` → Skia `fe2718df5f53a681087be6f0539045ca1b4b8c09` → HarfBuzz `9cb1fee51069b206effb4736e443b038d230789d`. HarfBuzz's source manifest declares **13.1.0**.

At lines 27–29, [HarfBuzz's solver](https://github.com/harfbuzz/harfbuzz/blob/9cb1fee51069b206effb4736e443b038d230789d/src/hb-subset-instancer-solver.cc#L27) identifies the port's origin as `fonttools/fonttools@f73220816264fc383b8a75f2146e8d69e455d398`, path `Lib/fontTools/varLib/instancer/solver.py`. That source commit declares **4.38.1.dev0**. This is a source-version boundary, not a claim that a fontTools package or Python runtime is installed in Knorvia.

The [complete fontTools license at the referenced commit](https://github.com/fonttools/fonttools/blob/f73220816264fc383b8a75f2146e8d69e455d398/LICENSE) is preserved verbatim in `third-party/upstream/6787208f83f659ccbc2223b2fde952ffa6f7e8aca62f1a8a2bf5bc51bb1b2383.txt`: SHA-256 `6787208f83f659ccbc2223b2fde952ffa6f7e8aca62f1a8a2bf5bc51bb1b2383`, Git blob `cc633905d333c4b42c1a0c8b34e9f734adeb6e1e`, 1,072 bytes. It contains the original MIT permission text and Just van Rossum's 2017 copyright. HarfBuzz's retained Old MIT notice and Behdad Esfahbod attribution remain unchanged.

Skia's bundled HarfBuzz `sources` list includes this solver at line 359. The canvas recipe requests bundled HarfBuzz, shaping and ICU; Skia's Unicode defaults and shaping dependency lead to that target. The PDF-subsetting workaround is a separate flag and does not guard this source-list entry. Resolved compiler/link inputs and published binary inclusion, including linker elimination, were not established.

The parent can append the single `skia.noticeAdditions` entry from this evidence and regenerate target notices/provenance. Preserve all existing notices and keep `Skia.reviewRequired`. The addition supplies the referenced source's notice; it does not relicense all HarfBuzz, Skia or Knorvia.

Checks confirm the source/license/version Git blobs, original source strings, build-list references, unchanged prior evidence and exact notice bytes. No source request failed in this bounded task. Product builds/tests, archive matrices and prior failed grant searches were not repeated.
