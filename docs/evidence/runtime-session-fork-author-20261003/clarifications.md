# Recorded API-only clarifications

All replies preceded source comparison, and contained names/signatures/behavior facts,
not predecessor bodies. Session store methods are messages({sessionID}), getSession,
createSession, commitForkBundle and entry/target ports; no sessionMessages or
createSessionEvent. runtime.createEvent accepts SessionEventType, payload, trace; event
creation is outside the post-commit append catch. Legacy public store accesses and
atomic public admission reads stay live; only the atomic commit owner captures its
store. clone/execution/model state dependencies stay unchanged. Goal terminal state is
complete, verification payload state completed. Notice fallback agent and stored
protocol strings are fixed. Part targetId/verificationId and boundary target/entry IDs
are identity inputs. Active compaction uses compactBoundary/timelineStatus, not an
invented info property. Child input clock belongs inside the final commit argument.
No author read predecessor/tests/oracles. The source-exposed curator supplied this
source-derived contract and compared/corrected the sealed draft; no clean-room claim.
