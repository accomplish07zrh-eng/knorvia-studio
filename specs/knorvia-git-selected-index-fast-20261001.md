# Selected staged-index projection

Baseline55dd11383bb14e892a2be38993bd26c57249fc51. Own only the private
parseGitIndexEntries body and selected-rename cleanup projection in gitCliRepo.ts,
one narrowly named private projection helper, and new tests/oracle/receipt. Both
old expressions match publisher872ad960 and local import7619e41 exactly. Leave
public declarations, accepted read/graph/status/helpers/path scope, mutation
command/lifecycle bodies, environment/permission policy and shared records exact.

```text
UI/service commit → existing repo resolution/path normalization
  → scoped status → ordered selected/rename cleanup projection
  → ls-files → NUL-record index decoding → existing conflict guard
  → existing temporary-index/commit/reset/finally lifecycle
```

- Cleanup starts with unique selected paths in their input order. Read scoped
  status once after taking that path snapshot; select records by exact current
  path before reading their originalPath fields. Append only truthy originals
  from selected records in status order, deduplicating against the initial paths
  and earlier originals. An appended rename source must never admit an initially
  unselected record. Preserve all getter/iteration/throw ordering and no mutation
  of source arrays or records.
- Index stdout is NUL-delimited; skip empty records, accept a final unterminated
  record, preserve record/duplicate order. Split each record at its first TAB.
  Header uses ECMAScript whitespace and only its first three tokens: mode, object
  hash, stage; extra tokens are ignored. Normalize backslashes in the entire path
  suffix, preserving its tabs, spaces, CR/LF and Unicode. Do not validate hash/mode
  grammar or trim paths. Missing TAB/token/nonempty path throws exactly
  `Failed to parse staged Git index entry.`; no partial result escapes. Keep the
  path normalization before missing-field validation and property order.
- Existing commit checks stage against literal `0` after full parsing; malformed
  later records retain priority over earlier nonzero stages. Preserve status/
  ls-files/head order, selected path scope, argv/cwd/env/timeouts/output caps,
  entry command order, unborn fallback, failure effects, cleanup and public output.
  No async driver, await, cache, cancellation, invalidation or state owner changes.

Design: retain standard NUL wire separation/input-type errors, then acquire only
three header tokens with a cursor and collect records in one ordered pass;
compile one selected-path membership set, fix the selected record list, then reuse
that membership for ordered unique cleanup output. This replaces chained
filter/map/header token-array parsing and repeated selected-array searches,
not a generic framework or move.
Only fake command/fs/clock ports and literal owned data; no actual Git mutation,
user IO or provider/network. Freeze bounded parser/projection and real caller
cases before implementation. Focused source/actual-emitted, direct consumers and
owned types/lint/format/architecture only. Retain source exposure/prose/API/glue;
root owns independent rights review, with no whole-file MIT/publication claim.
