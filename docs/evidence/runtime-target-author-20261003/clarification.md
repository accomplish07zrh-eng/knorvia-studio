# Public port-name clarification

Curator source-derived API facts, no bodies: runtime.rootTraceContext is fallback trace; runtime.runtimeTaskRegistry is registry; runtime.sessionId is the string projected into sessionID/sessionId fields. A SessionGoal's identifier property is targetID. Verification result predicate is verificationResult.verification.passed; next action and reason live on verificationResult.verification. Every 'trace spread' uses traceContextToLogContext(the exact trace named for that log).
