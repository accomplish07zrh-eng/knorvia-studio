# Complete same-author error-cause correction

The frozen v1 source remains archived at c6c98884. Curator found an omitted observable error-shape detail in the original six-file prose: its statement that pre-materialization validation throws without a cause meant no Error-valued cause, but failed to distinguish an absent property from an own undefined cause.

Both pre-try materialization rejection and the try/catch wrapping failure must construct Error with an options object containing the cause key. The key's value is the supplied cause only if cause instanceof Error, otherwise undefined. Therefore pre-try rejection has an own, native nonenumerable cause property with value undefined. Preserve existing error message/label observations, no new gate, authority, path fallback, store call, error type or validation. Catch preserves Error-valued cause identity and otherwise also owns undefined cause.

Produce a complete v2 replacement and new receipt in the separately authorized v2 output directory. Original six inputs, source-observation qualification, v1 source and receipt stay unchanged. This is a curator contract omission and same-author descendant, not a new fresh-author event. Only this eighth body-free file is additional evidence; no predecessor/test/dependency/function body is supplied. Module source under400lines and all previous requirements remain.
