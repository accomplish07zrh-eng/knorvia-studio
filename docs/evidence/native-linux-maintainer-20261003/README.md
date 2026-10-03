# Authorized Linux maintainer package acceptance

The user authorized the public email `accomplish07zrh@gmail.com`, superseding the
earlier hold. The existing native task/branch fast-forwarded latest main
`b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687`. Final product build/packaging input is
`b5fbc3d89c34c45d6d9f7e16183bbdaec79d75f8`, with Desktop metadata b5fbc3d8.
The later evidence commit does not change that product input.

The production diff adds four lines to the existing Desktop builder config:
author.email, the existing root Apache-2.0 application declaration, and a commented
pacman FPM zstd override. Name, homepage, package identities, dependencies,
hooks, UI/runtime/protocol/data paths and root/shared configuration remain intact.
Root LICENSE/NOTICE/third-party notices, manifest and lock are byte-identical to
the main baseline. This is packaging metadata and format repair, with no new
independent-authorship or component-license grant.

| Fresh Linux x64 artifact | Bytes | SHA256 |
| --- | ---: | --- |
| deb | 142231596 | `0fee2646f9b9483621afcf4818f88ace49ed9993b637c939dc78b1cfff04497a` |
| rpm | 118016425 | `ea78641ea60c32a69f2786ec4fdcc37c581416a6be444d0e41cfd49822bbd7cb` |
| pacman .pkg.tar.zst | 171971447 | `f742d0d005819c27ba58dbd8ee207fc89e2984aa77abc2f6287c016a804281dc` |
| AppImage | 188670677 | `c0881ec03cc5dbd4ed387c7eeec73ee6fcd9c778d2ea39bb00b1bb7299b8ab96` |

All four configured targets build in one final successful invocation, exit0,
with `--publish never`; no successful target is rebuilt afterward. Actual deb
Maintainer/Vendor, RPM Packager/Vendor and Arch packager are exactly
`Knorvia Studio <accomplish07zrh@gmail.com>`. Deb License, RPM License and Arch
license are Apache-2.0. All four physical ASARs are identical and their actual
application manifest carries that same email/license. Generated native package
versions remain 0.8.0~preview.3 for deb/rpm and 0.8.0_preview.3-1 for Arch;
application version remains 0.8.0-preview.3. Previous required dependencies remain.

The locked builder defaults FPM compression to xz despite the existing Arch zst
filename. A synthetic actual-tool probe reproduces XZ magic. The initial repair
using compression:zstd fails builder26.8.1's schema before targets start at exact
input cd801380; that full failure/source binding is retained. The supported target
fpm extension subsequently proves last-option override using the unchanged bundled
tool and produces actual Zstandard magic 28b52ffd in the final Arch package. No
schema/guard/dependency-pin relaxation or renamed format is used.

Sequential CLI/plugin source preparation completes at df7f5987; only builder
config and this spec change afterward, proving all runtime component source is
identical in b5fbc3d8. The production Desktop build is refreshed at b5fbc3d8 and
normal beforePack/afterPack hooks restore pinned PTY, inject22 runtime modules,
strip maps and enforce native layout. Locked Node24.14.0/pnpm10.33.2/Electron41.0.3
and builder26.8.1 are used. Missing RPM/cpio/bsdtar tools are downloaded through
signed official Debian metadata and extracted into task-owned prefixes; global
package/config/status installation is not performed. FPM is the builder's pinned,
checksum-checked official release. Acquisition/proxy requirements are separate
from the cleared product-runtime environments.

All four artifacts are physically extracted. Nine executable/ASAR/CLI/PTY/legal
resource digests equal the fresh linux-unpacked payload; root Apache/NOTICE,
third-party notice and existing MIT/icon license resources retain their exact
repository bytes. The unchanged canonical native probe runs on actual extracted
deb and passes six groups, exit0: package identity/policy/runtime entries; real
CLI in Electron Node; actual PTY; SQLite sentinel preserved after two normal
storage preparations; and packaged rg/ugrep/bfs with source/notices. Its original
sources remain under ../native-packaged-acceptance-20261003/ and are bound by hash.
The runtime fixture is removed. No model, real user profile or user computer is
used, and no installation/removal hook runs globally.

The initial metadata harness incorrectly assumes a Debian doc copyright path.
Its code/result/failure remain intact; the correction checks the locked FPM's
actual License control field plus exact configured legal payload bytes. It reuses
the successful extraction, retains all other assertions and rebuilds no artifact.
An initial freshness fetch without network proxy also fails; the normal network
retry passes ahead0/behind0. These are recorded separately from product failures.

Source/config-scoped lint has zero warnings/errors, source/spec format and changed
architecture pass. No unrelated full source/typecheck/lint/test/audit suite or
manual CI/release dispatch is repeated. Package-manager GUI/system installation,
RPM/Arch distro execution, complete legacy migration and Windows/macOS/model/GUI
acceptance are not established by these bounded extraction/runtime checks. Parent
integration/current-source and frozen-evidence registration remain; no cross-module
protocol/interface change is required. No main merge or release is published.

Commands, exact final/intermediate inputs, raw metadata/startup results, artifact
bindings, tool dependencies and failure logs are retained in this packet. Large
products and extracted payloads remain under
`/workspace/knorvia-native-linux-email-20261003`; result.json records their exact
paths. The email hold is closed for all configured Linux x64 package targets.
