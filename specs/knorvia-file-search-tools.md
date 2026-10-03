# Glob and Grep file-search boundaries

2026-09-30. Replace duplicated read-only search orchestration and result projection while preserving the public declaration/model wording, permissions, limits and all supported search options. No actual filesystem search, subprocess or network request is added outside the existing filesystem port. The current local parent includes the verified memory-origin batch pending transport; do not claim these commits are already published.

## Single path and ownership

Each invocation parses its own existing schema, captures the configured port, resolves an explicit search path or the existing working-directory default, then performs exactly one corresponding searchFiles/searchText request with unchanged signal and five trace fields. The adapter owns search execution and order. A shared stateless result projector converts display paths and maps the returned mode; there is no cache, extra sorting, deduplication, secondary search or retry.

Glob passes maxResults=100 and preserves returned order, duration, truncation and every filename. Grep preserves context versus -C precedence and nullish -A/-B overrides (including zero); all other flags, pagination, multiline, glob and type fields are forwarded unchanged. Grep alone wraps a filesystem cancelled error as the existing recoverable ToolCancelled with original cause/context. Glob errors and all other Grep errors propagate unchanged. Missing-port configuration errors and schema/path admission order stay compatible.

## Projection

Preserve the existing host-path rule exactly: display a slash-normalized relative path only if nonempty, not absolute, and not starting with two dots. Same-directory and dot-dot-prefixed names retain the original path even when lexical containment might be safe. Use the host path APIs; do not invent cross-drive behavior. Returned file and entry ordering is authoritative.

Grep uses returned mode, not requested mode, for projection. filenames appears only for files_with_matches; numFiles still counts all returned files. Content lines include the line number unless -n is false, but only when the entry has a non-undefined number (zero is valid). Missing text becomes an empty string; count mode uses zero for missing count. numLines is present only for content mode. Preserve appliedLimit/appliedOffset including undefined/zero, original numMatches and exact formatting/model strings. Existing public declarations and model formatters are mechanically retained and are not counted as independent expressions.

## Acceptance

First freeze unchanged-handler synthetic-port outputs, exact forwarded arguments, metadata, model strings, cancellation identities and configuration/path failures. Replay source and emitted entries, run generated old/new result/option cases, and execute root/CLI quality, builds and full regression. Inputs/results are synthetic; do not search user files for these tests. Native CI, UI/installer and source/license review remain separate. Keep transition attribution and 27 material obligations; no new MIT or global completion statement.
