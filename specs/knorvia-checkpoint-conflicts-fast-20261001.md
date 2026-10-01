# Checkpoint-relative conflict reads

Baseline9d01b4cfdbdd80daa20e88d61336d5159359a40d. Own only the body of
collectWorkspaceConflicts in gitCheckpointRepo.ts and narrow tests/spec/receipt.
The old declaration exactly matches publisher872ad960. Keep pathExists, parsers,
path helpers, command provider, repository resolver, checkpoint service/store,
restore/creation/diff/delete methods and public declarations byte-exact.

```text
service/RPC → existing metadata/resolution/diff admission
  → one scanner: ls-tree → each affected path's ordered presence/type/hash reads
  → conflict return OR existing fake restore → same scanner's target verification
```

- Empty affected paths return a fresh empty array with no effect. Otherwise issue
  exactly ls-tree -r -z from.commitOid -- ...affectedRepoPaths at repoRoot with
  no added timeout/cap/env. Validate the command before parsing/probing. Preserve
  accepted tree parsing, malformed record handling and original errors/receivers.
- Probe the current affected array after tree completion, in iteration order,
  including duplicates; do not snapshot, filter, parallelize or cache it. Resolve
  absolute paths with the unchanged helper before looking up expected entries.
- No expected entry: await unchanged pathExists; all lstat failures mean absent,
  and any successful lstat means unexpected-file-in-worktree. Do not inspect type
  or hash in this branch. Expected entry: rejected/thrown lstat means
  missing-in-worktree. Successful lstat reads mode before isDirectory; a directory
  or expected mode120000 without isSymbolicLink means type-mismatch. Preserve
  method receiver/short-circuit order and escaping getter/type-method failures.
- Remaining expected paths issue hash-object --no-filters absolutePath at repoRoot
  with no new options. Validate then trim stdout and compare the expected objectId.
  Mismatch means content-mismatch. Errors escape before later paths are probed;
  no diagnostic logging, retry, mutation or cleanup effect is introduced.
- Construct conflicts only after classification, preserving path/relative/
  workspaceRelativePath/reason field order and lazy workspace-prefix read. Keep
  raw repository-relative identity while using unchanged lexical normalization
  for the absolute/workspace paths. First conflicting occurrence fixes position;
  last conflicting occurrence supplies value. A later matching occurrence does
  not erase an earlier conflict. Never mutate params, tree records or port data.
- Original explicit awaits remain in this async owner, including pathExists's
  nested await when expected entries are absent. No extra async driver/helper.
  Concurrent scans remain independent; no cache/abort/current-reader owner added.
  Freeze queued/reentrant probes, changed paths during a pending tree read and
  late resolution/rejection against the old owner using bounded synthetic ports.

Design: classify one reason per path, construct one common conflict record, and
fold into an ordered result vector plus path→slot map during scanning. This
replaces four duplicated record constructors and the deferred Map pass without
skipping any IO. Standard predicates/commands/reason tokens/API glue remain
compatibility expression; source exposure and the copied test oracle are explicit.
Existing restore preflight, force behavior, fake mutation sequence and target
verification errors stay unchanged and receive direct service/RPC coverage.
Only owned fake command/fs/store/resolution/clock ports and literal fixtures;
no actual Git mutation, user files/data, providers/network, credentials or settings/
security changes. Focused source/strict emitted and scoped owned checks only.
Preserve all earlier reviews/notices; root alone reviews whole-file rights.
