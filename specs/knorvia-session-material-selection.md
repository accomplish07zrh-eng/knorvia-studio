# Session material ranking and selection

Root baseline: `20d6ca5987f5bcb8cb1caacbcac759b25b9eb452`.
This checkpoint freezes and then replaces only the pure snippet ranking,
budget selection and transcript chunk planning used by ReadSessionContext.
Persisted branch/compaction filtering, part interpretation/deduplication, public
schemas, model invocation and public formatting remain existing boundaries.
No storage, account, model or user-data operation is introduced.

One material-builder invocation owns its finite snippet records; pure selection
returns views into those records and does not mutate caller messages. Query
matching retains Latin/path tokens, Han whole terms/bigrams, de-duplication,
case handling, phrase bonus, bounded occurrence score and recency tie-breaks.
Relevant selection preserves positive-score preference, last-12 fallback,
score/index ranking and the existing one-item budget overshoot. Handoff keeps
the recent contiguous tail and always admits its first candidate. Chunk bounds
use content characters, excluding separators, with an oversized sole snippet
allowed. Relevant chunk selection retains the top four plus last chunk with
index de-duplication; handoff keeps the last five. Public string formatting and
reference identity/order remain compatible. No ranking-quality policy change
is implied by this implementation replacement.

```text
owned synthetic or persisted messages -> existing branch/part projection
                                    -> ranked snippet records
                                    -> pure selection/chunk plan
                                    -> existing transcript formatter
```

Freeze public-builder observations before editing production. Use owned text,
metadata and timestamps, both source and actually built JavaScript. The test-only
KNORVIA_SESSION_MATERIAL_TARGET=dist selector selects emitted imports and has no
product effect. Cover empty/ignored/model-only/synthetic/duplicate parts, query
languages, budgets, ties, oversized messages, chunk boundaries and reference
projection. Validate read-session extraction consumers after integration, then
build/types/lint/format/architecture/full regression and refresh provenance.

Source exposure and retained interfaces/formats are explicit. New hashes,
passing tests or moved functions are not authorship proof. Retain all licences,
notices and unresolved materials; no whole-file MIT or clean-room determination.
