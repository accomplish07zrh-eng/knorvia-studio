# Public port-name clarification

Curator source-derived API facts: trace spread for enqueue logs is traceContextToLogContext(input.traceContext), with no root fallback. Persisted notice uses command.traceContext. Runtime registry is runtimeTaskRegistry. Session record sessionId comes from runtime.sessionId.
