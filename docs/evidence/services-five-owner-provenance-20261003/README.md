# Services: retained Apache source facts, 2026-10-03

The user's latest instruction keeps the project Apache-2.0 and stops the MIT
rewrite/contribution-rights acceptance work. This receipt retains facts already
obtained before that decision. It adds no implementation, ownership acceptance,
whole-file originality declaration or licence transition.

The same `lane/services-20261003` branch was fast-forwarded to main checkpoint
`59517d9699519b0a7a44980da27df29d45f0e91e`. Its five complete current target files,
available Git histories and source/spec commits were read. Exact current hashes,
first available local snapshot bindings and the retrieved public inputs are in
[source-facts.json](source-facts.json).

## Confirmed upstream source inputs

All five retrieved inputs, including LICENSE, returned HTTP 200. Their raw-byte
SHA-256 values and computed Git blob IDs match the existing saved upstream
inventory at ZCode commit `872ad960de7ec172591f7e1952f7849229f94521`.
The two renamed paths are positive source correspondences; an empty exact-path
upstream field in an older local inventory did not establish original authorship.

| Current owner | Pinned upstream source path |
| --- | --- |
| `session/tasksDatabase/startup.ts` | `packages/services/src/session/tasksDatabase/startup.ts` |
| `git/commitMessageFileScope.ts` | `packages/services/src/git/commitMessageFileScope.ts` |
| `agent-session/sessionService.ts` | `packages/services/src/zcode-session/zcodeSessionService.ts` |
| `agent/taskIndexSyncer.ts` | `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts` |

Read-only source comparisons established retained expression, including the
renamed `scopeSpelling` function body (current lines 17–21, upstream
`normalizeCommitMessageScopePath` lines 5–9), session diagnostics/call payloads and
task-index event/subscription payloads. These portions must not be described as
new independently authored expression. The previous rewrite implementations and
their source-exposure disclosures remain intact; this receipt does not attempt
to accept their contribution rights.

The [pinned upstream LICENSE](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/LICENSE)
declares Apache-2.0 with Z.AI attribution and is byte-identical to the current
repository root LICENSE. Apache-2.0 does not erase retained third-party attribution
or licence conditions; preserve the applicable notices and modification records
under [section 4](https://www.apache.org/licenses/LICENSE-2.0#redistribution).
No root LICENSE, README, NOTICE, third-party notice or global source register was
edited by this batch. The integrator owns any repository-wide declaration update.

For `creationReference.ts`, the collected first available local snapshot is
`7619e41b950bd52073ebf36754146cf25659d9fa`; its later feature history includes
`63b4f9479ef91d79249feac1a2ae74e15a047901`. No exact/case-insensitive filename match
was found in the saved upstream inventory. That bounded observation establishes
neither worldwide absence nor complete pre-snapshot origin. The MIT-specific
follow-up and contribution-rights question are withdrawn after the user's new
instruction. Existing `NOASSERTION`, historical receipt and HOLD records remain.

## Protected paused work

The raw source-reading inputs, collected stage metadata, comparisons and the
uncommitted source-reader draft are protected locally at
`/workspace/knorvia-services-provenance-paused-20261003/source-reading-before-apache-decision.tar.gz`.
Archive SHA-256:
`6073c9f88fe69cef965529781ea0e9cd9b1bbe4bd8a5b7cc13dc51b6cef7cbee`.
The draft reader was never executed and is excluded from the committed deliverable.
The archive is a paused working record, not accepted licensing evidence.

**UNVERIFIED in this phase:** no tests, lint, typecheck, build, full audit or CI
rerun. Only necessary source/history/diff reading, receipt bindings and Git
delivery checks occurred. No UI, runtime behavior or user-data format was changed.
