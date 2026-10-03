# Runtime tool and agent wrapper owners

Draft PR: https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9
Branch recovery/server-lifecycle-20261002; target recovery/independent-logging-20260930-0456.
Baseline 57e5bfe4d833791f233a05fc5af139327860d86d.

Scope: runtimeToolDeploy.ts, agentBundleWrapper.ts, agentWrapperDeploy.ts.
Behavior/API packet: specs/knorvia-runtime-agent-wrappers-20261003.md.

## Authorship / access limits

Source-exposed curator read all three inherited owners and searched direct
consumers; public dependency/API declarations and nearby context were read for
the concurrent installer packet. Curator wrote the behavior packet and reviewed
candidate compatibility; this is not a no-source-access curator.
Fresh author /root/runtime_wrapper_author used fork_turns none, GPT-6.1 Sol high,
with no inherited conversation. Declared inputs: this functional/API packet,
root AGENTS.md and architecture-governance SKILL.md only, read using cat.
Complete temporary files authored with apply_patch, hashes via sha256sum.
No inherited implementation, tests, dependency source, Git/history/patches or
prior-author outputs were read. Shared filesystem boundaries are declared, not
OS-enforced. No novelty claim, MIT grant or final provenance classification.

Bounded curator clarifications confirmed exact canonical module aliases and
that IRemoteBackend has no declared kind property, requiring an optional-kind
structural view for the existing WSL gate. Fresh author made those corrections
on its own output; integration source edits are formatting only.

## Ownership and compatibility

Runtime owner retains sequential platform-tool admission, selected resource
filtering, installed-binary/version checks, installer delegation and post-install
literal version writes. Only platformArch is captured initially; installer and
selection remain read at the existing points. Generated wrapper keeps exact
HOME/runtime-root and argument bytes, one trailing LF and CRLF-only comparison.
Wrapper deployment retains fixed .new staging, WSL byte upload with local finally
cleanup and non-WSL literal-write/replace helper order. Shared executable-replace
helper retains existing permission policy. No new state/cache/backend cleanup.

## Scoped validation / deferred work

No ordinary runtime tests, semantic typecheck, package build, network, shell,
process, SSH/Docker/WSL/deployment or credential operations. No concrete candidate
write/permission defect was observed, so no synthetic safety test was added.
Full runtime admission/filter/marker/error/cleanup/platform matrix remains
deferred to aggregate integration. Static results and exact baseline/author/
candidate hashes are recorded here. Node 24.19.0 differs from pinned 24.14.0.

Protected cache/CDN/network helpers, dependency manifests, root LICENSE/global
provenance/inventory, security settings and other lanes remain untouched. No
main/cross-lane merge, Library access or cancelled-upload retry.

Static checks: oxlint 3 files, 0 warnings/errors; syntax-only diagnostics 0
on each owner; architecture OK, 0 violations/baseline/new; diff whitespace clear.
Production diff (added/removed):

```text
0	8	packages/server/src/remote/agentBundleWrapper.ts
4	6	packages/server/src/remote/agentWrapperDeploy.ts
11	16	packages/server/src/remote/runtimeToolDeploy.ts
```

The required pure wrapper body is byte-identical to baseline after formatting;
its production diff removes explanatory comments only. The other two small
owners also have limited structural differences. Complete fresh-author outputs
and declared inputs are recorded, but diff size/extraction/comment removal alone
is not independent-provenance evidence. Parent must assess functional-packet
derivation and provenance limits before classification.
