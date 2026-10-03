API-only clarification supplied during authoring: CoreErrorType from @knorvia/contracts;
executableNodeIdsForPhase/safeArtifactName from ./ids.js; summary/node prompt from
./prompts.js. All caller signals use options.abortSignal. Final graph gate is
ctx.appendGraphStatus(withArtifact, definition.phase, "completed", options.abortSignal),
not a new completed record payload. Scheduler appendGraphRecord forwards all three
arguments to ctx.store.appendGraphRecord with its live receiver.
