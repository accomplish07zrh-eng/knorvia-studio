# Linux zombie cleanup: actual defect and bounded repair receipt

Continue the original services task, `lane/services-20261003` and draft PR20.
Synced integration `e23ea3328716cbb3e5109e3f2d0082aca46de200` through merge
`a42727feb6cb41205eb49dd88dc20de4c86593c8`; the incoming integration changes are
baseline synchronization, not newly authored lane changes. No main merge.

## Actual reported failure and repair

PR22 input `e229f601267a5a41b37d0e25391a186215cf2c46` records Host exit 1,
remaining esbuild PID17570, state `Z (zombie)` and PPid1. Retained exact input
copies are [the actual handoff](reported-cross-module-handoff.md) and
[shutdown failure](reported-shutdown-failure.json); their original Git blobs and
SHA-256 bindings are in [source-bindings.json](source-bindings.json).
The recorded chain reaches `stdioTransport` through Agent process managers,
ownership/terminator and waiter. This is a real cleanup-observation defect,
separate from the still unavailable Agent runtime artifacts in that GUI record.

The waiter previously used only `kill(pid, 0)` for both early completion and
remaining-PID collection. Linux zombies still have PIDs. The
[kernel proc contract](https://docs.kernel.org/filesystems/proc.html#process-specific-subdirectories)
provides current state, parent/group and start-time metadata. Snapshot decoding
now retains optional service-local `linuxState`. Both waiter decisions read that
decoder afresh and keep ticks/optional PGID verification. Current Z is complete;
a new PID/group is outside the old identity's authority, not declared dead.
Reparenting alone does not retire an active process. Cached Z alone is insufficient.

Unreadable/malformed stat falls back to signal-zero. On Linux only ESRCH proves
absence; EPERM, other/falsy errors and hostile code getters stay conservative.
All other states, including sleeping/uninterruptible/stopped/unknown, stay active.
Darwin/Windows probe, force/wait deadline and ownership/signal policies remain.
No extra process discovery, accepted queue, signal target or reaping policy.

**The stdio/native error is not swallowed.** `agent/stdioTransport.ts` stays
byte-identical, including its nonempty-remaining exception. The original narrow
stdio test still requires rejection for remaining PIDs. Sixteen protected-file
bindings also preserve ownership/terminator/async-snapshot code, prior residual
services implementations, Apache/third-party declarations and historical
HOLD/author receipts. Root/shared/UI/data contracts are not changed by this repair.

## Precise commits and comparison

| Deliverable | Full SHA |
| --- | --- |
| Initial spec before implementation | `e4e5fb4a590272b237b88c1a79f0937a377b55e7` |
| Initial frozen contracts | `5c3d29873ba6f0f334569cb3518a8c47377013a4` |
| PPid1 supplemental contract/spec | `000804e56c1fe570954d4eb35401e564e0c90a7e` |
| Checked production repair: three files, +52/-13 | `21bbcf1ea6fb807197914089494d366ba6c338ab` |
| Final fixture closure: prevent fake PID503 real proc reads | `8a617e31126c1292adcc15f5566eb085d7119cc4` |

The [spec](../../../specs/knorvia-linux-zombie-cleanup-20261003.md) describes the
single decoder/completion owner and event order. Two new tests cover synthetic
boundaries and isolated actual kernel state; the original waiter fixture closes
its new proc-read dependency without weakening its existing assertions.

Final acceptance uses seven byte-identical fixture files bound at `8a617e31`:
two new cases plus the existing snapshot, ownership, waiter, terminator and stdio
files. For the original-source run, temporarily install exact pre-fix bytes for
only the three owned source paths, then restore the committed candidate in
`finally`, byte-for-byte. The full restoration commands and original/candidate
hashes are retained. No separate task/branch/worktree or user data is involved.

| Run | Actual exit | Node pass / fail |
| --- | --- | --- |
| [Final pre-fix source](baseline-final-runtime.tap), same final fixtures | 1, expected defect reproduction | 20 / 13 |
| [Final repaired source](candidate-final-runtime.tap), same final fixtures | 0 | 33 / 0 |

Both runs have zero cancelled/skipped/todo cases. Node's counts include the
synthetic parent aggregate; 13 failures do not mean 13 separate product defects.
All five previous narrow files pass before and after. The initial 31-count pair
and PPid1 33-count pair are separately retained, not relabelled as final runs.
[validation.json](validation.json) contains all actual counts, commands, platform
and log hashes; [frozen-oracles.json](frozen-oracles.json) binds the seven files.
[SHA256SUMS](SHA256SUMS) binds machine receipts, reported inputs and six raw logs.

Node v24.14.0 on Linux x86_64 ran only this bounded comparison. The detached
test-owned Python supervisor holds one genuinely unreaped exited child and one
sleeping child. Independently observe actual Z and successful signal-zero, then
capture actual ticks/PGID and use the real waiter with scheduling-only termination
injection. Zombie-only returns no remaining PID; the mixed tree retains the
sleeping child's PID. The after-hook requires supervisor `reaped:true` and exit0,
and the supervisor's `finally` waits for both children. No cleanup signal is sent
to another process/group; no zombie is deliberately orphaned to PID1. PPid1
boundaries are synthetic. This is not a full actual Host/native shutdown replay.

## Remaining acceptance and coordination

**UNVERIFIED:** typecheck, lint, root formatter check, build, architecture checker,
full regression/audit, native Windows/macOS, actual full Host/GUI shutdown and
complete product/source-rights acceptance. Scoped `oxfmt --write` is authoring;
no root quality gate or manual CI rerun was requested/adopted as acceptance.
Fake platform cases are not native platform acceptance.

The integrator must register the three changed sources, two new fixtures, one
modified waiter fixture and spec, then replay the real GUI/Host disposal scenario.
No shared/CLI protocol change is needed. Agent artifacts remain a separate GUI
blocker. Applicable Apache and third-party records stay; this repair does not
release historical HOLDs or assert legal originality/MIT/full independence.
