# Server lifecycle lane evidence

Scope: the seven files listed in `source-hashes.json`, plus this bounded evidence,
`specs/knorvia-server-lifecycle-20261002.md`, and the capability safety test.
Baseline: `f25b931164ee6287167e965e9da7a7586131b264`.
Integration target: `recovery/independent-logging-20260930-0456`.
Dedicated branch: `recovery/server-lifecycle-20261002`.

## Author and observer boundary

The root observer read the seven baseline implementations and derived the
behavior/API contract. A fresh internal author `/root/lifecycle_author` was
launched with `fork_turns: none`, model `gpt-6-astra`, reasoning `high`, and was
instructed to read only the contract and repository/architecture guidance. The
author receives no baseline implementation, existing tests or old patch. Bounded
API/import clarifications were supplied separately. The author writes whole
replacement files into a temporary directory; the source-exposed observer reviews
and integrates them. Final author and formatted candidate hashes are included in
`source-hashes.json`.

This is a candidate with a documented author boundary, not a legal conclusion or
a claim that the observer or entire repository had no source access. Dependencies,
remote backends, RPC framing, service implementation and runtime assets remain
outside this replacement. No MIT decision, LICENSE change, global inventory or
global provenance update is included. Parent classification remains pending.

## Baseline observations

- Checkout initially at `bd0bb01`; requested baseline absent locally. Ordinary
  fetch of the named recovery branch succeeded, then branch created at the exact
  requested commit. Workspace freshness passed (ahead 202 / behind 0 origin/main).
- Baseline architecture check: `architecture: OK`, violations 0, baseline 0, new 0.
  Server context: unmanaged, owner unassigned, no module.ts or dependency contracts.
- Initial `pnpm architecture:check --changed` could not start: installed pnpm
  11.19.0 tried its default unwritable data location, returning ENOENT. Direct Node
  invocation initially failed ERR_MODULE_NOT_FOUND for TypeScript. First temporary
  npm tool install likewise failed at its default unwritable cache. No sandbox
  escalation or permission change was attempted.
- Temporary npm cache/tooling and pnpm store under `/tmp` resolved setup. Installed
  pinned pnpm 10.33.2 and ran a server-filtered frozen-lockfile dependency install
  with scripts ignored. Node is 24.19.0; repository pins 24.14.0. Lockfile and
  dependency manifests remain unchanged. No runtime/native package build occurred.
- Capability safety check against unchanged source: 3 pass / 0 fail, exact output
  retained in `baseline-capability.txt`. This check uses only synthetic in-memory
  values and process-local random tokens; it uses no user credentials or data.

## Frozen limitations (source observations, not executed failing tests)

- Ack decoding uses per-chunk UTF-8 text conversion. Arbitrary binary suffix and
  split multibyte text are not protected. Timeout leaves the ack data listener.
- Lifecycle operations are promise-returning contracts; synchronous throws are
  not normalized into phase rejection handling.
- HTTP WebSocket close initiates scope disposal before disposing RPC admission,
  without awaiting. Stdio has a different deliberate ordering.
- Repeated close/error events are not deduplicated by socket adapters.
- Pending remote connections are module-wide and have no new expiry or disposal
  policy. WebSocket close does not dispose the underlying remote backend here.
- Capability cookie comparison retains raw cookie values without percent decoding;
  authentication metadata uses its existing separate environment source.

No bug fix for these limitations is authorized in this batch. They must not be
reported as newly failing runtime checks or as independently validated behavior.

## Validation scope

Latest user cadence defers aggregate acceptance to final integration. No full
suite, build, test matrix, native listener test, remote execution, UI check or full
scoped typecheck is claimed. Backpressure, wire framing, entry boot and HTTP route
runtime checks remain unrun. There is no EPERM observation because a listener was
not attempted. No Library data was accessed; no cancelled upload was retried.

## Completed batch

All seven implementations were supplied as complete files by the fresh author.
The observer sent bounded clarifications for async throw delivery, callback
receivers, console alias identity, URL parsing, relative-root timing and remote
id capture. The author applied these before final freeze. The observer then copied
these files into the repository and applied oxfmt; no source-exposed semantic
patch was applied after authoring.

Author's final access declaration:

> Read only the designated contract, repository AGENTS.md, architecture governance
> SKILL.md, and my generated outputs. Received bounded API/behavior clarifications
> from the parent. No existing implementation, tests, history, patches, or
> dependency implementation inspected.

This declaration describes the instruction/context boundary; agents shared a
filesystem, so it was not an OS-enforced source-access isolation boundary.
The lifecycle implementation owns per-phase completion explicitly rather than
reusing the old race implementation. HTTP routing, channel adapters, composition,
entry startup and token storage were authored from the behavioral contract.
Similarity caused by fixed APIs or policy values is not a novelty or license claim.

Executed after integration:

- `node --test packages/server/test/host-capability-policy.test.mjs`: 3 pass, 0 fail;
  raw result in `candidate-capability.txt`.
- `node_modules/.bin/oxlint` with the seven changed owner files and one test:
  0 warnings, 0 errors (`changed-lint.txt`).
- TypeScript `transpileModule` on only the seven owner files: 0 syntax diagnostics
  (`syntax.txt`). This does not perform semantic typechecking or build a package.
- `node scripts/architecture/architecture-check.mjs check --changed`: 0 violations,
  baseline 0, new 0 (`changed-architecture.txt`).
- `git diff --check`: no whitespace errors.

Production-source diff: 367 insertions, 558 deletions (net -191 lines). No new
module, export surface, dependencies or persisted formats. Aggregate compatibility,
real HTTP/stdin operation, semantic types, native runtime and build remain deferred.
No feature-completeness or independent-license completion claim is made.
