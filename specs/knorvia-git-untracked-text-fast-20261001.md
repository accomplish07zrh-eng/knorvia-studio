# Untracked text preview

Baseline73321fd442d9474685cde06afd1af6d11201872b. Own only the bodies of
splitUntrackedText and buildUntrackedTextDiffResult in gitCliHelpers.ts. Freeze
their publisher-identical declarations as an explicitly source-exposed test
oracle before production changes. Protect all other helpers, public declarations,
accepted read plans, service/RPC/UI callers, cache owners and command policy.

- The builder owns one readFile(absolutePath) await, without an encoding option.
  NUL bytes win over the strict byteLength > maxPreviewBytes check. Keep zero,
  equality, negative, NaN and infinite limits as ordinary JavaScript comparisons.
  Binary/truncated results retain their exact summary, null patch/content fields
  and property order. Any read, classification, decoding or assembly exception
  returns null; it never escapes as a rejected preview request.
- For text, normalize only CRLF to LF in the patch's lines; preserve bare CR,
  empty lines, Unicode, replacement decoding and all original decoded text in
  afterContent. Empty content has zero lines; one final LF does not add a final
  empty line. A nonempty last unterminated line gets the exact no-newline marker.
  Normalize backslashes only in the repository-relative header path. Preserve
  literal spaces, quotes, tabs and line breaks; this is no new escaping policy.
- Render the same --- /dev/null, +++ b/path and optional @@ -0,0 +1,count @@
  lines, '+' prefixes, final LF, empty beforeContent and null summary. Decode
  twice in the original order: once after path normalization for the patch,
  once for afterContent. Retain Buffer method/getter receiver and read order.
  Retain the native spread-insertion failure returning null at very high line
  counts; this checkpoint introduces no new line-count policy or defect fix.
- Actual getDiff resolves, normalizes, runs its ordinary worktree diff, checks
  existence, then awaits this builder. A truthy result ends that path; null alone
  admits the existing fake-tested no-index fallback. Staged/branch calls do not
  enter this boundary. Keep caller argv/cwd/timeout/caps and every await exact.
  Concurrent/reentrant requests remain independent; invalidation does not cancel
  an already admitted preview. No extra promise, cache, retry or state owner.

Use a raw-text line cursor that handles CRLF at each separator, an explicit
addition-line loop and a shared non-text result shape. Keep the insertion/join
compatibility expression for the documented failure above. Do not copy the old
explanatory commentary or introduce an interpretation framework. Freeze concise
golden outputs, getter/error priority, deferred settlement and actual service/RPC
consumer cases using only owned fake ports. Run focused source/strict emitted,
services-only types and explicit owned lint/format/architecture; root owns full
regression/builds. No native/user-file acceptance or licence grant is claimed.
