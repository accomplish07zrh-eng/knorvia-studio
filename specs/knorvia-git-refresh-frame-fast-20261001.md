# Ordered Git refresh frame

Baseline8571700ae9a7b8c8a19b5b742a19a6220d0b14ea. Own only refresh's body in
gitService.ts. Its fanout/frame assembly remain inherited; the branch/source
projectors have already been replaced and stay exact. Protect all factory options,
other methods, public declarations, repo/cache owners, helpers and command policy.

```text
UI/RPC refresh → service starts status, optional identity, optional comparison
              → one Promise.all await → comparison → summary → source pair
repo maps own reuse/cleanup                 → publish one complete frame
```

- Call status first, then test includeIdentity, then includeBranchComparison.
  Read workspacePath again for each requested port; preserve method receivers,
  getter order and synchronous throws stopping later acquisition. Disabled slots
  use Promise.resolve(null). Start all requested ports before Promise.all observes
  their thenables. Await exactly once in the original entrypoint; no async driver,
  cache, deadline, cancellation, retry or second snapshot owner is introduced.
- Promise.all preserves positional values despite completion order; rejection
  preserves the first observed error identity/prose and does not cancel other
  admitted reads. Retain reentrant/queued callers, current repo-map reuse, failure
  retirement, invalidation/different keys and late completion through real owners.
- After successful IO, project a truthy branch snapshot first, reading baseRef,
  headRef, label and accepted comparison projector in order. Falsy snapshots yield
  null. Read status.summary next, then accepted unstaged/staged projectors in that
  order. Keep projection error priority, output property order, record/reference
  shapes, workspace scoping and existing privacy/permission behavior. Publish only
  after both source lists are ready; no partial frame becomes public or cached.

Use one ordered request tuple and one local result frame whose source-list fields
are populated by an ordered source loop. This replaces fanout/result organization
without extracting inherited algorithms or changing accepted projection functions.
Freeze concise synthetic service/thenable/concurrency contracts and use existing
immediate refresh consumers; actual repo/RPC owners execute against fake ports.
Scoped source/actual-emitted, services-only types and owned lint/format/architecture
only. No root-wide gates/builds, real Git/provider/user IO or native/UI acceptance.
Disclose retained protocol/glue and copied oracle; root owns independent rights
review, with no clean-room, whole-file MIT or publication claim.
