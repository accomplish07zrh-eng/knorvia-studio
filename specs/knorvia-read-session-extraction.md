# ReadSessionContext bounded extraction replacement

## Scope and ownership

Baseline: `31305f58f6859f4d18d1e3f5e96148d6bf508081`. Replace only the
handler's extraction orchestration, not persisted-history selection, public tool
schemas, permissions, model-facing prose, model adapter or output projection.
The existing handler owns store reads and local/fallback results. A private
extraction plan owns sequential chunk progress and one accumulated note string;
it requests model work through the existing invocation boundary, with no IO,
new state store, parallel calls, retry, timer or public capability.

```text
validated input -> handler/store -> existing material builder
                                -> extraction plan -> existing model adapter
                                   <- awaited text <- trace/abort/model port
                                -> existing output projection
```

## Frozen behavior

- Schema validation precedes missing-store diagnostics. Store receiver, lookup
  order, missing-session result, error identity on abort and normal failure shape
  remain intact. No writes, real sessions or external model calls in tests.
- At most 80,000 cleaned characters uses one extraction. Otherwise snapshot at
  most five selected chunks, processing in order with no overlap.
- Chunk tokens are half the requested/default 6,000, floored then bounded to
  800–2,500. Full/synthesis uses the requested/default budget. Existing model
  cap, prompt truncation, trace context, tools=[] and signal identity remain.
- Empty and case-insensitive NO_RELEVANT_CONTEXT notes are excluded. Chunk
  headers read the chunk index after the awaited response, matching the old
  observable behavior. One accepted note within the output character budget
  returns directly; multiple notes or an oversized sole note require synthesis.
- Empty results fall back locally; model errors fall back with error unless
  aborted, in which case the original error escapes. No extra model retry.
- Existing public metadata, instructions, history builder, formatter, paths and
  user data remain unchanged. This is not a migration or a UI change.

## Verification and provenance

Freeze handler contracts before implementation, then rerun source and actual
emitted imports. The test-only KNORVIA_SESSION_EXTRACTION_TARGET=dist selector
selects built JavaScript; it is not a product environment variable. Add bounded
old/new synthetic differential coverage and exercise the actual handler/model
boundary, followed by builds/types/lint/format/architecture/full regression.
Record existing environment failures separately, not as passes.

This work is source-exposed. Retained prompts, declarations and formatting are
not newly authored simply because orchestration changes. Keep applicable
licences/notices and the 27 unresolved obligations; make no clean-room or final
whole-file MIT determination from tests or hashes.
