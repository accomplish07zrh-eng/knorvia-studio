# Services historical-gap replacement contracts

Continue `lane/services-20261003` and draft PR16 from the exact original base
`3b1ff0f715a43cbc51c576fd524479a08e58e203`. The parent explicitly authorized three
new complete behavior-contract candidates after reading the integrator's route at
`f969c9a7869ba33257968bcf0d15c1ffb63094bb:docs/lane-integration-20261003.md`.
That fetched ref is an observed contract input, not a merge/rebase of this lane.

## Historical evidence and scope

| Complete owner below packages/services/src | Current predecessor SHA-256 | Requested historical SHA-256 |
| --- | --- | --- |
| session/tasksDatabase/startup.ts | d5cc1b688fa979534a1a4520e5813a98f84ed66ae8f8525c10371a5761c03fde | a45bd7f55dfe610e78b9314ba5807403cd1397c372a8cd2da81c50d8c961c58a |
| git/commitMessageFileScope.ts | f813e660387f81f205ad6adbf925f4ec09f5c2e903aedeae768c1977311a9d2e | ca5bf8cc6396ab43992806626efb6f5700524ec9b0c0b4a36f19090e6c8a6761 |
| creation/creationReference.ts | 05cd4d5650393c7b3bfe605293776069b653603453fa3dd813f15bdc25cdd654 | 5a6716c314f943b7fe90e91e67c4d1a888efa28558849360114848ccd44bfb43 |

The integrator reports the requested published source/receipts unavailable in the
bounded retained history, including GitHub 404 for commit-scope blob
`69e43f4ce19a30ea185ba99ffb284ac0d798c6f8`. This is parent-reported locating,
not a new investigation or proof an unpublished version never existed.
Do not recover an old private /tmp artifact, reproduce the requested digest,
replace historical records, or call these candidates restored accepted bytes.
Creation's old binding concerns a bounded containment fix, not whole-file rights.
New implementation authorization supersedes the batch-4 decision to leave these
three runtime owners untouched; their old evidence and rights uncertainty remain.

One source-exposed author has read the predecessor and its public collaborators.
No clean-room, separate-author, whole-expression acceptance or MIT claim is made.
Declarations, fixed SQL commands/policies, diagnostics, MIME values, path helpers,
and retained migration/repository/provider expression keep their original lineage.
Shared contracts, schemas, root configuration, global provenance and licenses are
integrator-owned. No UI, data migration, job-ledger write or provider dispatch is
added. Implement the existing public entrypoints, with no parallel command path.

## Task-storage preparation owner

The session module remains a legacy service boundary. The complete startup
pipeline owns progress facts and two resource phases. A first-failure register
stores an entry containing the actual thrown value, so even undefined/null/false
survives cleanup. A lock-window object alone owns the common one-hour deadline;
each operation owns only whether its blocked progress has already been emitted.
SQL/schema/version checks/snapshots and post-migration repairs remain with their
existing public helpers and repositories, not new persistence owners.

```mermaid
sequenceDiagram
    participant Host
    participant Startup
    participant DB
    participant Repos
    Host->>Startup: prepare(path, progress)
    Startup-->>Host: checking (no migration facts)
    Startup->>DB: mkdir/open; busy/foreign-key pragmas
    Startup->>DB: inspect; snapshot if upgrade; WAL; NORMAL; BEGIN
    Note over Startup,DB: one deadline; only SQLITE_BUSY retries, 100 ms
    Startup->>DB: existing migrations / COMMIT
    Startup-->>Host: maintaining (committed facts)
    Startup->>DB: close; preserve first error
    Startup->>Repos: mark migrated; ensureReady in original order
    Startup->>Repos: close both; preserve first error
    Startup-->>Host: mark prepared; ready
```

- Preserve `prepareTasksIndexStorage(path, onProgress): Promise<void>` and the six
  phase literals. Each published migration object is a fresh shallow copy; the
  first checking callback precedes mkdir/open and has no migration facts.
- Keep recursive mkdir, native SQLite createRequire loading, busy_timeout=25 and
  foreign_keys=ON before starting the lock window. Inspection starts counts at
  zero. Emit checking with facts after inspection. An upgrade snapshot completes
  before WAL or BEGIN; a snapshot failure never enters the migration transaction.
- Retain Node SQLite numeric errcode low-byte 5 classification, per-operation
  waiting_for_lock once, shared one-hour budget and 100ms timer. Deadline expiry
  raises the existing cause-bearing message and kind=lock_timeout. Non-busy
  failures are never retried. A null/falsy thrown value or unreadable errcode
  getter must remain the original failure, not be replaced by a probe TypeError.
- Keep WAL, synchronous=NORMAL, BEGIN IMMEDIATE and existing synchronous migration
  execution in their original order. The migration helper owns rollback/COMMIT
  and updates the shared facts. After successful lock acquisition of BEGIN,
  introduce no extra await before migrations, maintaining, close, mark migrated
  and repository construction. Do not rewrite migration SQL or facts semantics.
- Attach a copied startupMigration to an extensible object work error when facts
  exist. Augmentation failure is ignored; retain the exact thrown object/value.
  Always close the opened DB. Its close failure wins only without a work failure.
- Mark migrated only after DB work and close succeed. Construct TaskIndexRepo then
  AutomationRepo with the same lock duration, await ensureReady serially, and
  attempt both closes in order with throwOnError=true. A work/first close error
  prevents prepared/ready. Constructor and initial mkdir/open failures keep their
  existing boundary. Mark prepared precedes the final ready callback.

## Commit-message file-scope owner

Reconstruct the full Git selection owner as an alias stream feeding one exact
path trie. Only terminal nodes match; directories never implicitly match their
descendants. The trie admits all aliases before filtering and owns boundedness;
an empty trie is the existing unbounded scope. No Git commands, status mutation,
filesystem IO or change-object copies are introduced.

- Preserve the exported function and parameter/result shapes. Discard blank
  trimmed session paths. No effective paths, including no effective aliases,
  yields a newly filtered array containing all original file references.
- Keep the existing normalization: trim, normalizeGitPath, remove one leading
  slash or ./, remove trailing slashes. Preserve case, repeated interior slashes,
  dot segments and literal Unicode according to the existing helper contract.
- Each effective path admits its direct normalized spelling. Absolute input may
  additionally admit nonempty, nonabsolute repo/workspace relatives that are not
  .. or ../...; retain native Node path/isAbsolute/relative OS semantics.
- Relative input additionally admits the normalized workspace-prefix alias when
  the workspace prefix is not '.' and the path does not already start with that
  prefix plus '/'. Keep existing root and empty-normalized spelling edge cases.
- Match any of path/repoRelativePath/workspaceRelativePath exactly after the same
  normalization. Retain file order, duplicates and object identity. Keep caller
  staging/diff/error behavior in gitService untouched.

## Creation-reference admission and byte owner

Creation remains a managed module using only its public ICreationService port,
with existing node.ts exports. Both public reads produce an immutable admission
record, then enter one file-handle byte reader; that reader owns its handle and
closes it on success or failure without replacing the primary error.
The job ledger owns succeeded/output identity. Admission never persists bytes,
mutates jobs, rewrites a recorded path or sends a provider request.

- Keep both function signatures and {name,mimeType,dataBase64} shape. Preserve
  PNG/JPEG/WebP extensions, case handling, base64, 10 MiB and existing diagnostics.
  Check file/size before bytes; check verified hash before MIME. Native IO failures
  continue to reject rather than become a dispatch or an empty reference.
- Ordinary reads realpath the workspace (when present) and requested file. Permit
  canonical containment or a matching succeeded recorded output, with the same
  Windows path-key folding and first-output order. Project-contained input does
  not consult listJobs. No scan/realpath of unrelated historical output files.
- Containment uses complete path components: reject '..', '../...' or a native
  absolute relative result, but allow an actual contained name such as
  '..portrait.png'. A symlink escaping the project is rejected unless its canonical
  target itself has the existing recorded-output identity.
- Verified reads first reject workspace-file inputs, then require the original
  resolved source spelling to match a succeeded output. Require a nonempty stored
  hash equal to the supplied hash, then require SHA-256 of the captured bytes to
  equal both. Missing stored hashes fail with the existing hash-consistency
  diagnostic, following knorvia-creation.md's workflow handoff rule. Ordinary
  legacy records without hashes remain usable and no record is migrated.
- Capture realpath before opening either admission. Read only the captured file
  handle. Recheck that the request still resolves to the admitted canonical path
  and that path stat's device/inode matches the opened handle before and after
  reading. A changed route fails with the existing origin diagnostic (ordinary)
  or handoff-changed diagnostic (verified). POSIX leaf opens use O_NOFOLLOW;
  Windows relies on realpath and handle/path identity observations. These are
  portable observations, not a claim of atomic openat containment against an
  adversarial filesystem changing every ancestor between observations.
- Read in bounded chunks, stopping after at most limit+1 bytes; require nonempty
  actual bytes within the same cap even if a file grew/shrank after stat. Do not
  accept a directory, oversize result or invalid extension. Ordinary display name
  comes from the canonical path; verified display name remains the original source
  basename. Release the handle before returning encoded bytes.

## Deferred acceptance

**UNVERIFIED:** no tests, lint, typecheck/compiler, formatting/architecture checks,
builds, full audit or CI rerun. No executable test files are added in this batch;
the source-focused phase instruction overrides the skill/repository check steps.
Only source/dependency/difference reading and exact Git/source binding follow.

Final unified acceptance must cover DB lock/snapshot/commit/progress/falsy-error
and cleanup ordering; all Git aliases/root/unbounded/Windows cases and retained
references; creation project/recorded/symlink/changed-file/missing-hash boundaries,
byte caps/MIME/encoding/cleanup, and failure before createJob. Include existing
startup, future-database, upgrade-protection, Git generator consumer, workflow
file-handoff and media-loopback suites without using them as already-run proof.
Source/whole-expression and rights review of the new complete candidates and all
historical bindings remains integrator work before any MIT release decision.
