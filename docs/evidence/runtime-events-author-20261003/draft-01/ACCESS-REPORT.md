# Draft 01 access report

## Inputs accessed

- `/tmp/knorvia-runtime-publication-20261003/events/contract.md`: read in full.
- `/tmp/knorvia-runtime-publication-20261003/events/api.d.ts`: read in full.
- API-only clarifications supplied by the parent: runtime port/property spellings; public payload and identifier type names; logger optional chaining and spread trace fields; live runtime method receivers; message timing structure and timeline discriminator; exact summary threshold reason `count_threshold`; queued payload delivery literals `guide` and `queue`; live nonoptional durable and session-initialization store reads with optional methods, retaining the optional store timing read.

## Outputs authored

- `events.ts`: public create, append, sink notification and persisted-flag functions; session initialization re-export.
- `events-summary.ts`: per-runtime insertion-ordered append summaries and synchronous admission/flushing.
- `events-durable.ts`: native async durable dispatch and verification timing read.
- `events-session.ts`: native async session initialization.
- `ACCESS-REPORT.md`: this access report.
- `SHA256SUMS`: final source and report hashes, excluding the manifest itself.

## Boundaries

No repository body, history, tests, oracles, other packets, production files, settings, providers, or live application IO accessed. No tests or builds run. No subagents spawned. Unchanged dependency owners were referenced by imports only. No curator comparison performed before sealing this draft.

## Review and limitations

Manual review against the supplied contract only. Public exports match `api.d.ts`. Each source file is below 400 lines. Type integration and behavioral verification remain curator work under the stated access boundary.
