# Task database migration controllers

Parent allocates migrations.ts SHA256c57f2e84f0db5f479ed3c76c73b05352784307828ab5ff624ecba1b4e1d24ebf and provider-selection-v2.tsb5a496b8854cb3c5fae4238622b10ce5c0cfeaf41aadc98fdece611f0bc2dbf2 at47652be6fb50c752bc2176b8c5a7d005e3cbc0ec, same PR10. Root reports exact hashes/no accepted review or complete candidate receipt; inherited migration ledger status retained. Local hashes match. Stop on contrary accepted evidence, local absence alone not authorizing another owner.

Whole owners: runner controls snapshot/preflight, lock-time recheck, ordered checksum-authorized migrations, facts/progress, commit/rollback and idempotency; provider-selection controller performs one frozen legacy-column projection with guarded writes/default NULL distinction. SQL/schema/version/checksum-input/provider identity constants are fixed data and remain exact, including whitespace and serialization order. Existing data/read/write authority and transaction policy unchanged. Session remains legacy unmanaged.

```text
synthetic DB port -> preflight -> upgrade snapshot port -> BEGIN IMMEDIATE
  -> lock-time ledger recheck -> ordered existing-checksum / pending SQL
  -> progress + facts -> ledger INSERT -> committing progress -> COMMIT
      failure -> active ROLLBACK -> same error + migration identity
synthetic legacy rows -> frozen selection decoding -> guarded model_selection write
  -> NULL for unresolved explicit intent -> JSON null for absent/default intent
```

schema-v1.ts remains exact761eaba0a85b51eb529b865ab4f0f2edb21af46fdb9b8fdbdb49e53d22114f24. startup.ts remains locald5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde, final-integration HOLD: parent has newer accepteda45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a and task-storage-preparation-expression-20261002.json. Do not reauthor/import/fetch that replacement or integrate it. Other SQL/snapshot/repos/prepared authorities stay unchanged.

Fresh fork-none Sol high authors receive only manual body-free public signatures/ports and required external behavior/frozen data. Each whole source <=400nonblank, raw frozen BEFORE own review, revisions separately preserved. Coordinator source-exposed; constant/API/type/dependency/common-expression lineage retained, no novelty requirement/MIT/legal/whole-process cleanroom claim. Saved Fast requested without verified switch.

MANDATORY minimum new synthetic transaction/order/idempotency/checksum/data-preservation tests run original then candidate. Type-only node:sqlite import, no DatabaseSync construction/open, database file/native SQL/migration deployment/user data. Mock snapshot before import; source IO authorities never exercised. Fake database objects implement query/transaction/ledger behavior in memory; synthetic legacy rows only. Scoped types/lint/format/architecture only, no ordinary suites/build/full-project types/install/stubs. First exact failures and existing21 consumer diagnostics remain blocked, frozen59listenEPERM preserved. No global LICENSE/provenance/inventory/manifests/security changes/cross-lane or main integration/force-push/deployment/bundle/source-upload retry/Library403 alternative.
