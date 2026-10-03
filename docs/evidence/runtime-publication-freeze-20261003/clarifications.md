# API-only clarifications before draft sealing

Message author: createEvent/appendEvent are runtime methods with explicit trace;
getTools returns named declarations, traceContextToLogContext is spread, model identity
field is model.modelId (not id), default literals realUser/model-only/agent/build.
Checkpoint author: permitted dependency-api.md adds port spelling and message/part/
timeline signatures; createForkedSession -> Promise<SessionId>, checkpoint selector ->
CheckpointCreatedPayload|undefined, shared payload reference. Event author: runtime
port/property spelling, exported payload type names, messages/timeline shape, summary
reason count_threshold. Durable branches use live nonoptional sessionStore followed by
optional method; only timing helper uses optional store. No source body/history/oracle
was supplied. Contracts remain source-derived, curator source-exposed.

Original fixture failures: temp package resolution and missing fake logger.debug.
Corrected fixture adds that declared fake method; product assertions unchanged. Three
baseline persistence observations now complete. Original failure logs remain immutable.
