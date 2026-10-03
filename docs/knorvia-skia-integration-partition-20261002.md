# Skia integration partition and JPEG XL ICC scope — 2026-10-02

Use [the machine-readable partition](../licensing/evidence/skia-integration-partition-20261002.json) for the 24 entries supplied by `35fafe5` and `c17cde6`. It recommends **21 existing snapshots** for the Skia source/build material record and defers promotion of **three supporting documents**. No new snapshots were created. Preserve all existing notices and the Skia review flag; this partition clears zero whole obligations.

| Partition | Entries | Evidence and limits |
| --- | ---: | --- |
| Release-referenced component source | 17 | Tan, Goronzy, eight Adobe CFF notices, five Arm JPEG notices, Arm PNG attribution and Expat's CC0 declaration. Nine are in GN-listed files/headers (including platform conditions); eight follow FreeType's literal include graph. “Release-referenced” means package `gitHead` → Skia gitlink → DEPS source pins, without a reproducible native-build attestation. |
| Explicitly pinned port or generator origin | 3 | Two kurbo alternatives from its named immutable commit, and Microsoft's notice for exact HarfBuzz generator inputs. Preserve both kurbo texts without choosing a license; reuse the Apache snapshot. |
| Independently pinned exact data match | 1 | Adobe glyph data at a 2019 publisher commit matches all 4,482 FreeType generator rows and 4,401 decoded table mappings. FreeType names the data/version but does not pin that Adobe commit. Retain this content-match qualification. |
| Deferred supporting documents | 3 | Official CC0 legalcode, Unicode 17 ReadMe and current Unicode V3 text. Each remains available with its exact hash and retrieval/version qualification; none is promoted as a release-pinned input. This is not an instruction to remove any previously integrated text. |

The JSON's `recommendedAdditions` entries reference exact existing files/hashes and prior evidence pointers. Shared selection rules retain the Arm platform conditions and distinguish listed source, transitive includes and generated inputs. Parent integration owns artifact applicability and global regeneration.

The retained JPEG XL source establishes a decoder-side path: `decode.cc` reads metadata through `Bundle::Read`; `image_metadata.cc` visits color encoding; the non-default structured-color branch in `color_encoding_internal.cc` calls `CreateICC`; `color_management.cc` creates the profile and writes its Google 2019 / CC-BY-SA 3.0 statement into the `cprt` tag. The public decoder ICC API can copy those bytes to its caller. Embedded input ICC data has a separate read path, so this does not establish that every input/output profile has that tag.

The generator takes color fields and code constants; no standalone ICC template is read in the shown function. Its fixed 2019-12-01 header date is explicitly a placeholder. Several math/color headers and the selected `SkJpegxlCodec.cpp` caller body are absent from the retained source set, preventing a complete numeric or application-export trace. The existing JPEG XL BSD source notice and PATENTS must remain; the output string does not replace them or establish MIT compatibility.

The canvas build recipe enables JPEG XL decoding except for riscv64; the retained Skia manifests select the traced source files. **Current desktop packaging nevertheless excludes all Canvas packages** and runs an ASAR check that rejects them. Canvas remains a locked pdfjs optional dependency. The retained wrapper and sampled Linux native package manifests show JS/types and a `.node` payload, not upstream C++ or a standalone ICC file. These are configured/source-manifest facts, not proof from a final release artifact or every extra resource.

The parent decision remains concrete: establish whether a specific distribution includes Canvas/libjxl or exports a generated ICC, then assess that material scope while retaining inherited statements. No available artifact proves such shipping/export, and no absence claim retires the broader source/history obligation. The 47 HTTP 429 failures and 799 unrequested ICU references remain untouched.

Validation is limited to the complete/disjoint 24-entry partition, existing snapshot bytes/hashes, retained ICC source digests, build selections, packaging-source bindings and whitespace checks. No network source retrieval, publisher code execution, runtime change or global inventory edit occurred.
