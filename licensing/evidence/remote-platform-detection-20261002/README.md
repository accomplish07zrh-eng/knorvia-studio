# Remote platform discovery and shell construction — batch 3

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch: `recovery/server-lifecycle-20261002`.
Baseline: `784e3ad23aa8b3afbfe7daacd682551719f0f970`.
Target: `recovery/independent-logging-20260930-0456`.

Exclusive production paths in packages/server/src/remote: detectEnv.ts,
posixShell.ts, docker-detect.ts and wsl-detect.ts. Contract:
`specs/knorvia-remote-platform-detection-20261002.md`.

## Authorship and scope

The observer read these four baseline owner files and searched direct importers.
The fresh internal author `/root/platform_discovery_author` was launched with
`fork_turns: none`, `gpt-6-astra`, reasoning `high`. Reading is restricted to the
functional contract and repository/architecture guidance; implementation, existing
tests, patches/history, dependency implementations and other authors' output are
excluded. Complete owner files are written into a separate temporary directory.
The source-exposed observer reviews the result and integrates it. This shared-
filesystem instruction/context boundary is not OS-enforced isolation.

No novelty, MIT or final independent-provenance claim is made. Parent classification
remains pending. No root LICENSE, global provenance/inventory, dependency manifest,
remoteAssetCache/cache/network/CDN helper, backend/deployment, credentials or
permission/authentication setting changes. No other lane was merged.

## Baseline and safety boundary

Exact baseline blob ids and SHA-256 values are in `source-hashes.json`.
Baseline freshness: ahead 204 / behind 0 origin/main; no tracking branch reported
by the freshness helper. Baseline architecture: OK, 0 violations/baseline/new.
The existing server context is unmanaged with no module contract.

A single pure string safety test checks quote boundaries for apostrophes,
substitution-looking text, newlines and home-prefixed destinations. Its golden
expectations exercise real command-building outputs without executing those
strings, reading credentials, or invoking any shell, Docker, WSL, SSH, network or
deployment command. Baseline result: 1 pass / 0 fail; exact output preserved in
`baseline-literal-safety.txt`.

Preserved source-observed behavior includes uppercase-PATH-only lookup, no
candidate deduplication, permissive Docker row fields, WSL parseInt prefixes,
NUL-based UTF-16LE detection, TTL measured at cache admission, stale rejected-load
protection, and lenient WSL availability errors. These are compatibility facts,
not newly executed defects or fixes. Platform selection remains reported-platform
normalization with the single Darwin-reported/Linux-kernel override.

## Deferred validation

Latest user cadence skips ordinary test matrices/builds. Docker/WSL executable
resolution against the real host, native process probes, WSL cache/runtime/platform
behavior, semantic typechecking, full suites and builds remain unrun. No native or
remote-runtime pass is claimed. Only the minimal pure quoting safety check plus
scoped authored-source diagnostics are planned. No sandbox/security setting was
changed, no Library data accessed, and no cancelled upload retried.

## Completed batch and executed checks

All four complete files were authored from the functional packet. Observer static
review requested WSL decoding/normalization separation and string fallbacks on
indexed parser fields. Initial scoped lint then identified one no-control-regex
warning for NUL removal; the fresh author replaced it with a string operation.
All semantic corrections were made by that author without source excerpts. The
observer integrated the full authored outputs and formatted them with oxfmt.

Exact access declaration: author read only the designated specification, root
repository AGENTS.md and architecture-governance SKILL.md. Filename discovery also
exposed the apps/cli/AGENTS.md pathname, whose contents were not read. No product
implementation, tests, history, patches, dependency source, credentials or other
author output accessed. Corrections touched/hashes only the authored temporary
WSL file. No author tests, builds or Docker/WSL/SSH/network commands ran.

Executed:

- Minimal pure string safety check: baseline 1 pass / 0 fail; replacement 1 pass /
  0 fail. Exact outputs: `baseline-literal-safety.txt` and
  `candidate-literal-safety.txt`. No generated command was executed.
- Initial oxlint over four owner files plus that test: 1 warning, 0 errors; warning
  localized to WSL NUL-regex matching (`initial-lint.txt`). After author correction,
  only WSL lint reran: 0 warnings/errors (`corrected-wsl-lint.txt`). Other checked
  files were unchanged. No lint/security rule was suppressed.
- TypeScript transpile-only syntax: 0 diagnostics across four owner files
  (`syntax.txt`); semantic types and package builds remain unrun.
- Changed architecture: OK, 0 violations/baseline/new (`changed-architecture.txt`).
- `git diff --check`: no whitespace errors.

Production-source diff: 155 insertions / 300 deletions (net -145 lines). Public
function/type exports, platform outcomes, quoting formats, discovery defaults and
cache owners remain as contracted. Source/author/candidate hashes are recorded
for parent classification. This is not aggregate compatibility acceptance.
