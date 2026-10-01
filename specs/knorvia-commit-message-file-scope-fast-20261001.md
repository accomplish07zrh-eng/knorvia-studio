# Commit-message file scope

Baseline9cacedbe01156417db17ca2925f0a5c705dde4d9. Own only
commitMessageFileScope.ts and new narrowly named tests/oracle/receipt. Its six
function declarations match pinned publisher872ad960; the previous expression
review remains historical. Keep public declarations, gitService, refresh,
generator, projectors, config, repo/helpers, UI and shared records exact.

```text
UI/RPC generation → existing status owner → this synchronous path scope
                                           → existing first-eight diff fanout
                                           → one existing generator
scope owner: local alias keys only; no IO, await, cache or accepted state
```

- Read workspacePath, repoRoot, workspaceInRepoPath, session paths in that order,
  trim all supplied paths before expanding any, then read/filter files. Missing,
  null, empty or whitespace-only paths admit all files. If expansion produces no
  nonempty keys, also admit all. Keep filter order, duplicates, sparse-array
  traversal and original file references; never mutate input.
- Keys trim whitespace, convert backslashes, remove exactly one leading `/` or
  `./`, then all trailing `/`. Do not collapse internal slashes, dot segments,
  case, Unicode or repeated leading prefixes. Preserve existing malformed-input
  errors and eager reads of all three file-path fields before lazy normalization.
- Each nonblank source contributes its raw key. Host-absolute sources also
  contribute repository-relative then workspace-relative aliases only when the
  normalized relative string is nonempty, not `..`/`../...` and not absolute.
  Relative sources gain a workspace-prefix alias only outside `.` and when not
  already prefixed. These are compatibility spelling rules, not filesystem access
  authority. Preserve host POSIX/Windows semantics and unusual empty/dot spellings.
- Match a file by path, repoRelativePath or workspaceRelativePath in that order.
  Preserve service source ordering, filtering before the eight-file diff window,
  rejected/empty diff omission, receiver/effect/await order, metadata and outputs.
  No model, command, request-lifetime, cancellation or permission policy changes.

Design: scan canonical key bounds rather than regex rewriting; compile aliases
into one sorted/deduplicated vector and use binary membership. Keep source alias
acquisition order and existing array-filter semantics while replacing expansion
storage and lookup organization. No generic framework or second scope owner.

Freeze small synthetic golden/differential cases before code, including both
path dialects through isolated pure adapters and actual service/RPC/UI callers.
Source/strict emitted checks, owned lint/format/types/architecture only; no root
suite/builds, actual files/Git/provider/network/security effects. Disclose copied
test oracle, retained APIs/path rules/glue and root's pending rights decision.
