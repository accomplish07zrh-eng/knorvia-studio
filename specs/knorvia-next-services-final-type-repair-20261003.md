# Services final targeted type repair

Continue the original `lane/services-20261003` after fetching and fast-forwarding
its combined tree to `19f6ccf74ba1064ca81d93194b4f25a36030e361`. PR16 is already
closed/merged; deliver a new pushed commit to the integrator without another PR.
The parent now authorizes necessary targeted types, lint and offline tests.
Earlier batches remain unverified at their historical checkpoints.

The 43 distinct services diagnostics in the integrator's
`docs/evidence/backlog-integration-20261003/final-first-pass.json` concern seven
existing production files: commandFileParser; gitCliHelpers; gitCliParsing;
gitRepoPush; legacyProviderEndpoints; nodeApiNetwork; skillSyncDiscovery.
Their current owners and public interfaces stay unchanged. This is a compatibility
repair of indexed values, not a new independent implementation or rights decision.

- Command metadata consumes existing rows, preserving continuation boundaries,
  unknown metadata, prompts and generation/write behavior.
- Git status and numstat consume one ordered record stream. Rename continuations
  consume the same following records; missing continuations retain null/empty
  original paths or omit an incomplete numstat destination. Validate required
  capture fields before producing entries. Preserve XY/kind/conflict rules,
  binary counts, negative zero, path tabs, headers, order and duplicate handling.
- Git helper readers consume admitted header lines and only bytes actually read.
  One synchronous work iterator owns untracked-file admission before each await;
  existing worker count, byte limits, file closing and error-to-zero rules remain.
- Git push keeps tracking/config/origin/sole-remote precedence and diagnostics.
  Endpoint migration keeps same-origin sharing and original URL/path/search data.
  Proxy matching keeps wildcard/suffix/port semantics; absent host fields cannot
  admit a bypass. Skill YAML requires a present capture, including empty strings,
  and keeps existing fallback names, discovery roots and malformed-YAML handling.

No schemas, persisted bytes, UI, shared contracts, root/CI configuration or
licenses change. No `any`, ignore directive, non-null assertion or weakened
compiler setting replaces a missing-value decision. Targeted compilation and
offline fixtures must report actual results and prerequisite/runtime limits;
global validation, historical evidence/HOLD and MIT acceptance stay integrator-owned.
