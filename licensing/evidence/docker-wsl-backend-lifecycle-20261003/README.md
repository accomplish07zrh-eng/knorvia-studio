# Docker / WSL backend lifecycle owners

Draft PR https://github.com/accomplish07zrh-eng/knorvia-studio/pull/9; branch
recovery/server-lifecycle-20261002; target recovery/independent-logging-20260930-0456.
Captured source baseline b088fe3883d162e61700a769faec4a624242678c. Factory/connect
was committed independently during authoring; these three owners remained
unchanged. Scope docker-backend.ts, wsl-backend.ts, wslProxy.ts. Packet
specs/knorvia-docker-wsl-backend-lifecycle-20261003.md. backend.ts retains public
declarations byte-for-byte. No declaration-only rewrite for textual novelty.

## Source-exposed curator / fresh-author boundaries

Curator read all three baseline owners and retained backend.ts, searched direct
consumers and public discovery/close/environment/deployment/RPC/service/target
declarations with surrounding implementation context. Curator is source-exposed.
Behavior packet includes exact generated-command/output templates, public API,
paths and cancellation/disposal/error ordering derived from baseline. No inherited
TypeScript implementation was supplied to author. Packet derivation and any small
source differences are provenance limits, not an independence/MIT classification.

Fresh author /root/docker_wsl_backend_author, fork_turns none, GPT-6.1 Sol high,
no inherited conversation. Only permitted functional packet, exact project root
AGENTS.md and architecture-governance SKILL.md plus bounded API clarifications.
No inherited code/tests/dependency/Git/history/other guidance/prior-author outputs,
SSH/auth/security/permission-repair/cache/CDN/network implementation reads.
Shared filesystem exclusions are declared, not OS-enforced. Complete outputs
authored in separate temporary directory; curator reviews/integrates/formats.
No novelty/diff-size/legal licence claim or final provenance classification.

## Ownership and retained policy

Docker owns one memoized container/home Promise, no disposal registry; dispose
remains no-op. Upload writes stdin as current container user, never docker cp,
chown/chmod or permission repair. WSL owns memoized identity and its own child
map/disposed barrier/wait Promise; closes stdin synchronously, then bounded
grace/owned-child kill/wait, never terminate a distro or arbitrary process.
WSL retains UNC preference/fallback and distinct progress/signal streaming path.

Local backend quoting stays literal with apostrophe escaping rather than
substituting the stricter shared quote helper. Proxy helpers remain pure, using
existing shared quote port only where already appropriate; log formatting omits
userinfo/path/query/hash. No network/security authority settings change. Existing
argument/output decoding, home/path, discovery identity, upload progress/event
ordering, stderr/error and late-callback policies remain contract requirements.

Frozen oddities preserved: Docker sticky info and no child teardown; WSL discovery
uses a new executor arrow per call; no new upload abort check after exec/listener
registration; successful UNC read remains raw; some upload-close failures don't
destroy streams; owned-child error/exit/close first event removes ownership;
WSL local copies have no extra disposed gate. No workaround/native pass claimed.

## Validation limits

Ordinary runtime tests, semantic types, builds and native discovery/process/UNC/
proxy/connection/upload operations remain unrun. No credentials, real user data,
SSH/Docker/WSL/network/deployment command execution. At most one injected safety
check if static review observes a concrete candidate ownership/write risk. Full
upload/backpressure/error/proxy/cancellation/disposal matrix deferred. Scoped
checks and exact baseline/author/candidate hashes will be recorded on integration.
WSL existing file-local max-lines exemption retained if needed; no global rule
change or ownership split for novelty.

No protected helper/SSH/auth/security/dependency/global provenance/inventory/root
LICENSE changes, main/cross-lane merge, Library access or cancelled-upload retry.
Freshness ahead210/behind0 origin/main, helper no tracking branch; unmanaged
server/no contract; baseline architecture OK, 0 violations/baseline/new.

## Actual author access / bounded correction record

Author declared exactly packet, project-root AGENTS.md and architecture skill
reads. An initial /workspace/AGENTS.md attempt found no file; curator provided
correct permitted project path. Other reads limited to own temporary outputs
and hashes of permitted inputs, no broader source or guidance discovery.

Bounded curator clarifications confirmed module aliases and already-resolved
info/branch-only home reads for private async path helper. Static review then
restored private async buffer executor and await-based outer upload Promise
boundaries through the fresh author. No new cleanup or permission policy.
Production source edits after corrected output are formatting only.

No concrete owned-child/write/permission defect was observed requiring a
safety check, so no runtime tests or synthetic platform matrix were added.
Actual source-level review is not proof of native runtime behavior.

## Scoped static check record

Initial scoped lint: 3 owners, 1 warning/0 errors (WSL no-control-regex for NUL
removal). Exit code was 0; no lint failure is claimed. Raw warning retained in
initial-changed-lint.txt. Fresh author used equivalent literal string replaceAll
for actual U+0000, without adding suppression or changing global rules. Only
WSL source lint/syntax needs recheck. Other two owners had no diagnostics.

Initial syntax-only diagnostics: 0 on each owner; no semantic typecheck/build.
Architecture: OK, 0 violations/baseline/new. No runtime test or native operation
was run. Diff whitespace clear. Final scoped results and hashes follow.

Final WSL lint: 0 warnings/errors; WSL syntax-only diagnostics 0. Original
Docker/proxy checks remain clear; no broad repeat checks or runtime tests.
retainedDeclarations hashes prove backend.ts unchanged. Production diff:

```text
176	267	packages/server/src/remote/docker-backend.ts
302	487	packages/server/src/remote/wsl-backend.ts
37	73	packages/server/src/remote/wslProxy.ts
```
