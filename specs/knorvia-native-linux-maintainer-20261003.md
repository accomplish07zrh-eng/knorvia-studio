# Linux package maintainer metadata

The user explicitly authorized the public maintainer contact
`accomplish07zrh@gmail.com` on 2026-10-03, superseding the earlier request to hold
Linux formats requiring an email. Continue the existing native task/branch from
latest main `b3b2fc5f51d2e76ff76c20aff44eb2b1d562c687`.

Desktop electron-builder `extraMetadata.author` is the single packaging owner.
Add its email without changing the existing Knorvia Studio name or public homepage.
The locked builder derives deb/rpm/pacman maintainer/vendor values from that owner;
do not add parallel format-specific contact values. The root application license
is Apache-2.0, while the current Desktop package metadata omits a license field.
Carry that same declared license into `extraMetadata` for the new installation
packages. All component-specific license/NOTICE/source records remain intact;
this is no new rights or independent-authorship claim.

Retain configured package identities, targets, dependencies, install/remove hooks,
icons, native resource policy, runtime closure and application data paths. No
runtime state owner, message protocol, UI, data migration, root manifest, shared
configuration or CI rule changes. A missing build tool is an environment problem,
not grounds to drop a target or relax its package checks.

The existing pacman artifact name ends in `.pkg.tar.zst`, but the locked builder
passes xz compression when no target compression is configured. A synthetic
actual FPM-format probe at df7f5987 reproduces XZ magic beneath that Zstandard
suffix. Explicitly select pacman zstd compression so the existing advertised
format matches the actual bytes. Retain the package name and dependency list;
this changes packaging only.

Build fresh Linux x64 payload from the exact committed metadata-change input,
then produce the previously blocked deb, rpm and pacman targets. Inspect actual
package metadata for the authorized contact, application identity/version,
Apache-2.0 and existing dependency declarations. Extract package payloads into
task-owned directories and compare their runtime/notice bytes against that same
fresh directory payload; execute the existing bounded native probe on an actual
extracted payload. Do not install globally or operate user profiles/computers.
Record input SHA, artifact sizes/digests, successful/failed targets, commands,
environment/tool requirements and remaining acceptance limits.

Run file-scoped configuration lint/format and changed architecture checks, plus
the relevant package/probe validation. The user's request explicitly limits this
phase to targeted checks; do not repeat unrelated full typecheck/lint/test/audit
suites. Hand off a draft PR based on main for parent integration; do not merge or
publish a release.
