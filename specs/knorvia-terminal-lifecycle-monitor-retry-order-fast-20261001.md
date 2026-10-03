# Monitor cleanup retry-order clarification appendix

This appendix follows immutable fd71001/cf6965c. Root independently proved that the monitor
spec's unqualified acquisition-order wording overstates order across retries. No production
policy, implementation or error precedence changes. Earlier specs/receipts remain intact.

TerminalServiceInstanceOwner remains the single owner. Before a failed handle is requeued,
the native cleanup snapshot follows acquisition order. If kill fails, exit remains owned;
data disposal is attempted, and any failing data handle is deleted/requeued behind exit.
A later accepted-kill retry permits exit disposal and follows the retained/requeued order:
exit, then data. If both throw, AggregateError.errors is [exitError, dataError], with exitError
as cause and its message as the aggregate message. Cleanup failures remain owned for another
explicit cleanup retry, with open=0 and no additional kill after termination is accepted.

```mermaid
sequenceDiagram
    participant Owner as Single instance owner
    participant Port as Owned fake PTY
    Owner->>Port: first kill throws
    Owner->>Owner: retain exit; data cleanup throws and requeues
    Owner->>Port: explicit retry kill succeeds
    Owner->>Owner: cleanup retained exit then requeued data
    Owner->>Owner: errors preserve retry order; cleanup remains owned
```

Freeze two synthetic regression cases: successful second-pass exit/data order and second-pass
two-error order/cause/message with a third cleanup-only retry. Use actual RPC Emitter handles
and owned fake ports, checking counts, bulk diagnostic retirement, no duplicate kills and
closed IO admission. Run the same cases against source and strict emitted owner, preserving
normal runner isolation and budgets. No native process, user file/settings, dependency/CI
or production edits. This is a later appendix with its own commit/digests, not historical
fd71001 acceptance and not a native-platform or authorship claim.
