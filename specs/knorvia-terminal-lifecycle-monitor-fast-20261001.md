# Terminal internal exit-monitor ownership correction

Append-only correction after dc05985 and historical provenance checkpoint 91d15b8. Root
proved that a failed kill retires the sole native exit subscription while the PTY remains
unconfirmed live. An eventual exit is then lost. Installed node-pty 1.1.0 WindowsPtyAgent
selects WinPTY on synthetic release 10.0.17763 even with useConpty=true; numeric-zero
getProcessList leads to a throw after native teardown and later kills may permanently fail.
This is source-exposed evidence, not native Windows acceptance or an originality conclusion.

## Single owner and ordering

TerminalServiceInstanceOwner alone owns reservations, PTYs, tagged native subscriptions,
public emitters and diagnostics. Tagging the acquired data/exit subscription distinguishes
cleanup duties without another accepted-state owner or native adapter policy. No changes to
terminalService.ts, public declarations, launch planning, profiles, lazy loading, helper
permissions or node-pty. The retiring/open/exited admission predicate remains unchanged.

```mermaid
sequenceDiagram
    participant Port as Owned fake PTY
    participant Owner as Instance owner
    participant Public as Public emitters and data subscription
    Owner->>Owner: close admission before kill
    Owner->>Port: kill
    Port-->>Owner: throw; termination unconfirmed
    Owner->>Public: retire; preserve cleanup failures
    Owner->>Owner: keep acquired exit monitor and retry entry
    Port->>Owner: deferred native exit through retained monitor
    Owner->>Owner: record exited; release monitor; settle diagnostics
```

An acquired internal exit monitor remains owned while the PTY has neither observed exit nor
accepted kill. Public emitters and data subscription retire immediately, so deferred exits
after failed dispose do not notify retired public listeners. A successful kill or observed
exit permits release of every native handle; cleanup uses a finite snapshot and keeps any
failed disposer for explicit retry. The cleanup loop rechecks termination before disposing
each handle because data cleanup can reenter a native-exit callback. Late handles returned
after cancellation/reentrant failed kill receive the same ownership policy.

Repeated or reentrant disposal does not duplicate an in-progress kill. After failed kill,
only explicit dispose/disposeAll retries invoke kill again. A retained monitor can settle a
later exit without any retry kill, including during bulk retirement; diagnostics unregister
only when all reservations/resources retire. New service use can register again normally.
Already-terminated callbacks cannot republish entries or restart kills.

## Errors and deliberate correction

Kill errors still propagate by identity, even when underlying teardown already happened.
Do not infer exit from message text, ESRCH, native-handle guesses or backend-specific errors.
Kill is primary, then public emitter cleanup, then eligible native subscription disposal in
acquisition order. Exit listener errors precede cleanup errors on ordinary live native exit.
Multiple errors retain existing AggregateError/cause/message conventions and bulk snapshot
order. Deferred exit monitor-disposal errors propagate from that callback and retain cleanup
ownership (open=0); later explicit disposal retries cleanup without another kill.

The old edge assertion that failed kill disposes both native subscriptions is intentionally
corrected: it must dispose data only until termination is confirmed. Normal accepted-kill and
observed-exit cases continue to require both handles retired. All immutable historical
specs/receipts/red proofs remain intact.

Safe limitations: if onExit registration throws before returning an acquired handle, the
owner cannot retain a handle it never received. If the backend never delivers exit and kill
never succeeds, the closed-admission entry stays tracked for explicit retry; no timer,
polling, backend patch, arbitrary acceptance or automatic duplicate kill is introduced. A
disposer that throws after unsubscribing remains tracked for cleanup retry; future delivery
cannot be guaranteed by the owner once the backend has removed its listener.

## Failure-first and final validation

Freeze red source and strict emitted cases before changing production. Use actual RPC Emitter
subscriptions with delivery gated by disposal, owned synthetic PTYs, deferred exit after
throw-before-kill and throw-after-native-teardown, explicit retries, bulk diagnostic retirement,
monitor-disposal failure, reentrant cleanup, late setup handles and no duplicate kill. Exercise
actual installed WindowsPtyAgent JavaScript constructor/kill through a closed fake require
adapter and actual Knorvia service/RPC consumers; every native/process/socket/filesystem/OS
port is synthetic. Read installed test-artifact source only, never user files/preferences.

Run source and strict emitted lifecycle/RPC, planning/profile regressions, root types/lint/
format, changed/full architecture, CLI/desktop builds and unchanged full studio regression.
Record exact commands, individual-case/file counts, red proof, corrected assertion, hashes,
source exposure and native gaps. Linux synthetic and installed Windows JavaScript acceptance
do not establish native Linux/macOS/Windows or packaged GUI acceptance. Publish append-only
lane commits. Historical matrix 91d15b8 stays bound to 07709cd; its checker must reject this
new live owner hash, not silently accept or rewrite that historical snapshot. Shared licensing
records/notices/preview identity and all 27 material obligations remain unchanged.

Before production edits, both standard isolated source and strict emitted red runners
reported two files, 20 individual cases: 16 failed, four controls passed, zero skips or
cancellations. Starting owner SHA-256 is
8041c744742150c5a1d2c34f580452ee0db7775a7f216f34ea257111ce109619. Red logs and
unchanged starting bytes are preserved under /tmp/knorvia-terminal-monitor-evidence;
the following receipt will record exact final commands and results. The sandbox's suppressed
child-test diagnostics were not substituted for individual-case acceptance; approved normal
isolated runner access was used without changing tests, isolation, concurrency or timeouts.
