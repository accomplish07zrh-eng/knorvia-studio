API-only curator clarification during authoring: every timestamp() mentioned is
this.ctx.timestamp(); definition.title/kind are this.ctx.definition fields. Output
traceId is the chosen snapshot.traceId, never context or options traceId. Context
methods/fields named by the author match the packet. Preserve private ctx/public
constructor and the packet's ordered output fields.

API-only author revision: activity keys are entry.activityId. Original draft retained; revised retry-state-v2.ts separately bound before curator comparison.
