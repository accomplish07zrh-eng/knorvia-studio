# Portable terminal profile checkpoint — fixed services lane

Start `79e5eab90e5b94937abdc42d7f13ec0c5869b54c`; branch
`parallel/file-watcher-fast-20261001`. Watcher/archive commits and paths stay immutable.
Root alone integrates. This stage owns portable `terminalProfile.ts`, narrowly named
helpers/tests, its [spec](../specs/knorvia-terminal-profile-portable-fast-20261001.md), and
this receipt. macOS implementation and public terminalProfileTypes declarations remain
unchanged. No additional agent/conversation was created.

## Lineage and pre-code evidence

Fetched recovery remains `0d80f9ca37b1daef162ecc69bd18f6e8fc30a146`; fetched lane matches
79e5eab. Portable blob `9fbcc28f7759cd7a924eb5592491fedde004a5bc` matches both; only imported
snapshot history, upstream-modified/NOASSERTION/review-null inventory and no completed
independent replacement were found. Portable SHA-256 before replacement:
`87de0917ecfc67196966e121a6556ce503897c8bc5a27b68b3a0c759c7738761`;
upstream blob `156cfdc19749563b5d8380933e5687853c4afc64`.

Mac blob `153a19560f824d032421f60a7a5fe0150471bf6e`, SHA-256
`e25ea5af453dcf05352f19f0e77452e3c02ddde44822a3059badaced50bf5c77`, is upstream-unchanged.
Public types SHA-256 `2b61bb42156542e062d6e786c580a9747b479e0f6b65d684503e3480e61eca0b`
is also upstream-unchanged. Neither is counted as independently replaced at this stage.

Freshness passed (ahead71/behind0 versus origin/main); branch lacked a tracking setting,
so remote equality was separately confirmed by fetch. Changed architecture passed with
zero violations/baseline/new. Generated services context remains legacy/unmanaged;
no module contract/direct dependency contracts exist. Static refs confirm resolver import
and real call in terminalService.create; terminal.ts uses its type re-exports. No preexisting
direct resolver contract tests were found.

Spec precedes code. Inherited resolver is frozen with 60 cases: synthetic filesystem,
home/platform and macOS-provider ports; two native owned config cases; three actual
terminalService create cases with fake PTY/command/filesystem adapters. Custom fonts,
detector paths/precedence, JSONC corpus, TOML/YAML/Kitty grammar, error identity, public
result shape, repeated calls and theme identity are covered. No real profiles/credentials,
terminal/app launches or permission repairs occur.

An initial expectation missed comma-separated font display normalization; it was corrected
to the observed old contract before freezing. Consumer environment isolation initially
dropped Node's test IPC marker and yielded a file-level aggregate plus three inner cases;
preserving only NODE_TEST_CONTEXT corrected the harness. Those earlier aggregates are
not counted as final acceptance. Pinned Node24.14.0/pnpm10.33.2, standard subprocess
isolation, unchanged 120,000ms per-test timeout. Logs are in
`/tmp/knorvia-terminal-profile-evidence`.

The author read portable source and limited Mac factory/IO context. Source exposure,
retained compatibility declarations/values/grammar and unchanged inherited Mac code
require root's contribution review; there is no clean-room or blanket MIT claim.
LICENSE/NOTICE, preview identity, shared provenance and all 27 obligations remain.
