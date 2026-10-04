# Knorvia Studio 0.8.0-preview.4 desktop release

## Behavior and ownership

Publish a new, non-draft GitHub Release for Windows x64 setup and portable ZIP,
plus the native self-extracting portable EXE; publish Linux x64 AppImage, deb,
rpm and pacman packages plus a separately marked portable AppImage and tar.gz.
Keep the preview channel
until its acceptance boundaries warrant a stable version. Existing tags,
releases and attachment bytes remain immutable. Root `package.json` is the
single version source. The requested maintainer email is
`accomplish07zrh@gmail.com`. On 2026-10-04 at 00:34 UTC the end user directly
confirmed public GitHub PR and Release-package disclosure of that exact
maintainer address. The parent supplied the question, answer and direct message
lookup. Resume the existing release work within that scope; retain the earlier
refusal receipts and stop any action that receives a new approval rejection.

The user subsequently authorized the exact public maintainer address directly
in this original integration task and instructed continuation of merge/release.
The earlier cancellation and review refusals remain historical outcomes.
The release workflow supplies the official Electron URL through ELECTRON_MIRROR,
the actual input read by bundle.mjs, as well as the runtime-assets variable.

The existing native task owns Desktop builder configuration, packaging hooks
and installation scripts. The existing UI task owns installer brand images and
their previews. The integration task owns the release workflow, acceptance
helpers, publication metadata, root version and cumulative source inventories.
These are build utilities outside the managed runtime module roots. No runtime
state owner, profile path, protocol or product identity changes in this release.

The first actual candidate exposed two probe defects, not accepted product
results. ASAR extraction uses host-native path separators, so nested metadata
paths must use `join` on Windows as well as Linux. Packaged Main is an ES module;
its inspector expressions obtain a require function through
`process.getBuiltinModule("module").createRequire` rooted in the actual packaged
ASAR. They must not depend on a CommonJS global or inject changes into Main.
All source binding, created-window and persistence assertions remain required.
The inspector can attach during Electron's Node bootstrap, before its module
alias is registered. State polling explicitly reports not-ready until the
actual Electron module cache registration exists; after registration any
evaluation failure still fails acceptance. The existing startup deadline stays
unchanged. This is an initialization marker, not a swallowed runtime error.

## Ordered release path

```mermaid
flowchart LR
  A[Resolve one full source SHA] --> B[Linux quality]
  A --> C[Windows quality]
  B --> D[Linux build and package acceptance]
  C --> E[Windows build and package acceptance]
  D --> F[Verify unified hashes and source binding]
  E --> F
  F --> G[Existing release-immutability decision]
  G --> H[Publish new release and missing assets]
```

Both reusable quality jobs must check the same full source SHA. Packaging
checks out that SHA; acceptance records bind version, source SHA and actual
artifact hashes. A failed, cancelled, skipped or missing required check blocks
publication. A candidate dry run executes the same read-only acceptance and
immutability gates. After the normal main merge, final release packages are
built afresh from that exact main commit; candidate bytes and historical
preview.3 artifacts must never be relabeled as preview.4.

Each platform records a manifest after actual package acceptance. One aggregate
helper verifies all bytes and emits `SHA256SUMS`, per-file `.sha256` attachments,
release metadata, installation guidance and retained legal notices. It rejects
missing platforms, duplicate names, malformed hashes, source/version mismatch,
failed acceptance or a manifest whose current bytes differ from its hashes.
The existing `scripts/release-immutability.mjs` remains the only authority for
create/upload/skip/reject. Upload only its named assets, without overwrite or
tag deletion. Read-only validation also runs for dry runs.

Native source head `1836f419aa2ac41117e21b1ba01e196d66227a2a` adds the
variant/profile and guided shortcut contracts. Its source batch is unverified;
the earlier Linux package receipts do not establish its acceptance. Build
installed and marked-portable variants in separate matrix jobs/output trees.
The existing Windows staging helper still owns the compatible setup/portable
ZIP filenames. The additional native portable EXE and Linux portable packages
are accepted and named separately, without a second profile-selection owner.
Aggregate all four required platform/variant manifests; the same immutable
publication decision applies to every attachment.

For marked portable products, launch the actual artifact twice in a hosted
runner fixture, without explicit Knorvia profile-root overrides. Read actual
packaged Main paths through its localhost Node inspector, require a created
Electron window and the data root beside the original launcher, then request
normal application quit. Check fixture-file and SQLite sentinel persistence
across launches. Linux uses a private Xvfb display and documented AppImage
extract-and-run when FUSE is unavailable. These are bounded actual startup and
path checks, not human GUI, model-task or full legacy-migration acceptance.
Every process/display/profile created by this probe has a recorded owner;
terminate only those processes on failure, and never remove preexisting data.

## Installation and acceptance boundaries

The Windows guided installer uses Knorvia's existing black-and-white brand,
welcome/progress/finish pages, a selectable directory and shortcut options.
Upgrades preserve profiles. Ordinary uninstall preserves application data by
default. Windows portable ZIP uses its existing marker and adjacent `data/`
directory; marker presence is checked in the extracted ZIP, and absence in the
setup payload is checked independently. Installed Desktop and Linux AppImage
use the existing system-user configuration base. AppImage is a portable
deployment format, not a promise of adjacent portable profile storage.

Run package acceptance outside the source checkout using freshly extracted or
installed products and isolated synthetic profiles. Required checks cover
executable/ASAR/bundled CLI identity, metadata version/commit, native package
policy, actual CLI startup and storage preparation, SQLite data preservation,
PTY loading and packaged native search tools. Windows additionally exercises
silent setup, reinstall and ordinary uninstall on the hosted runner, checking
that synthetic data survives. Linux verifies all package formats, maintainer,
license and extracted payload identity before runtime acceptance. Never infer
real model-task, existing-user migration or human installer GUI acceptance from
these bounded checks.

Do not create signing credentials or fabricate a signature. Record actual
Windows Authenticode status; clearly document unsigned packages when signing
is unavailable. Root Apache-2.0, NOTICE and per-component licenses remain.
Packaging evidence is not a new rights decision or proof of full independent
authorship. Preserve prior failures and historical product input SHAs.

## Regression scenarios

Aggregate metadata tests reject a wrong full SHA, platform version mismatch,
missing required formats, failed package acceptance, duplicate attachment names
and altered package bytes. Existing immutable-release tests retain their tag,
digest, unknown-query and idempotency assertions. Register new release helper
tests in the existing root offline test entry. Use the pinned Node/pnpm versions
and required reusable quality workflow; avoid repeated local full suites.
