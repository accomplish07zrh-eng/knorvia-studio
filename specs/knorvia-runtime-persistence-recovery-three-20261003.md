# Runtime persistence/recovery owner reconstruction

Base: `890d289ed319610f58792f26327ca5f0068520f7`, existing A branch/draft PR11.

Own only `runtime/methods/bash-shell-snapshot.ts`, `runtime/helpers/persisted-remote-session-path-repair.ts` and `runtime/methods/file-rewind.ts`, plus directly necessary private rewind planning/storage modules and named packets/oracles/receipts. Existing store, filesystem, shell service, checkpoint selectors and runtime remain the sole state/effect owners.

```text
session shell snapshot → existing store → validated selection → existing resume caller
remote session facts → narrow CAS → fresh facts → caller-visible identity/repair
checkpoint facts → reverse simulation → guarded write journal → commit → event
                                             └─ failure → reverse compensation
```

Preserve APIs, ordinary supported records, key/field order, references, clocks, native await gates, errors and publication boundaries. No new permission, access, cancellation, retry, deadline, storage format or path policy. In particular file-rewind currently does not forward its accepted targetTurnId to checkpoint selection: preserve observed behavior rather than silently enabling a fallback. Its event append is after write/commit catch and does not cause compensation. Rollback is uncancelled and includes the journal entry made before a rejected write.

Freeze exact source and scoped compiler JS/declarations before authoring. Source-derived body-free functional/API/import/dependency packets go to fresh no-inherited-context internal authors; archive draft hashes/access journals before curator source comparison. Curator source exposure and strong predecessor correspondence remain qualified for independent review, with no clean-room or whole-file licence grant.

Three compact concrete safety areas: shell stored-format clone/parse and recoverable save failure; remote CAS refresh/concurrent identity and persistence rejection; rewind external-modification rejection and write/commit rollback/publication. Owned synthetic ports/data only. Ordinary suites, broad builds, source/emitted matrices and native acceptance remain deferred. Scoped types/API/lint/format/architecture and one minimum actual-emitted safety pass are sufficient for this candidate batch; preserve failures, never weaken assertions or route current selectors to old artifacts.

Screening excludes fixed declarations/small adapters, accepted originals, E reservations, all permission/full-access modules and security-coupled MCP/config/steering/subagent owners. Larger model/turn orchestrators remain future active candidates; nonsecurity scope is not claimed exhausted. Inventory metadata is historical, not a new licence determination or publisher acquisition.
