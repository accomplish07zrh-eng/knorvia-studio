# Predicate source-observation qualification

Author identified an ambiguity before freeze: whether the media predicate can capture block.source once. It cannot. This qualification is a separate seventh input; original six files remain unchanged.

After image/video/PDF media admission, evaluate the inline source-kind test from a fresh block.source observation (optional kind access). If kind equals inline, isArtifactUri receives uri from another fresh block.source observation. A true artifact classification ends source admission immediately. Otherwise evaluate local_file kind from another fresh block.source observation; only a local_file match observes path from another fresh block.source and applies Boolean. Do not capture the source object once across these tests, combine the two branches or eagerly read uri/path. Exceptions and short-circuiting remain native. The media predicate may run again during selected content mapping, using the same observation rules.

This requirement differs from the materialization resolver: that operation intentionally captures source = block.source once at entry. All other contract requirements remain unchanged. This is existing observable compatibility, not new path/authority/validation behavior or a novelty claim. No predecessor/function/test/dependency body is supplied.
