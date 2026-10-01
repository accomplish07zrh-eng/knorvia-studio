# ListSavedWorkflows model projection checkpoint

Branch `parallel/cli-tools-fast-20261001`; baseline `e32191b62decc906338d5eabadcae76a4c7c8fae`.

- Freeze/spec: `f667ff42262ff5c64db054d99dfcb20a5ce4d562`.
- Production: `aba0442d09cb300a12ed747c55f276b33a3f2637`.
- Evidence: appended commit containing this handoff (`git log -1 --format=%H -- docs/knorvia-list-saved-workflows-model-fast-handoff-20261001.md`).

Only `list-saved-workflows.ts` and private `list-saved-workflows-model-renderer.ts` changed in production. Ordered argument-note readers and a synchronous workflow-line generator replace the inherited nested push construction. The original formatter still owns schema admission, invalid-result prose, empty-list special case and attribute escaping. Workflow blocks precede invalid rows; the count/container is assembled last. All model strings, newlines, escaping, default JSON/description behavior, order and native failures are preserved.

The filesystem handler/store, public declarations/schema identities, description/permissions/budgets, 10-second deadline and cancellation/trace metadata remain byte-identical. Those excluded filesystem paths were **not invoked**: tests use synthetic listing-result handler ports through real registry/executor projection. This is no filesystem/store acceptance claim and introduces no live workflow/provider/network/user-data/settings effects.

## Verification

- Frozen/final source and strict actual emitted: **5/5 each**; 22 direct observations, 6 complete-executor paths, 9 completion-edge comparisons per mode, plus early-abort/repeat/concurrent controls.
- Immediate catalog consumers: **4/4** source tests.
- Core emission, core/root types (5422 locale keys), root lint, format and full/changed architecture passed. Owned 5-file/94-rule lint: 0 errors and 1 intentional no-thenable warning.
- Final CLI workspace types and configured CLI lint also passed; these cover both appended slices.
- Core configured lint retains 24 errors/11 warnings across 27 unchanged digest-bound inputs. No rule/security/budget changes.
- Concurrent synthetic fixtures use one clock owner and assert Date restoration. No supported production difference was found.

Per reduced cadence, no full suite or full CLI/desktop build was run. e0da79e's 6278-test full run is historical, not current. Root owns aggregate publication gates and native Windows/macOS/packaged acceptance; these remain unperformed here.

## Evidence and source exposure

[Receipt](evidence/knorvia-list-saved-workflows-model-fast-checks-20261001.json) binds **8 owned files,327 protected inputs,16 emitted artifacts** and unchanged regions. Owned tuple SHA256 `d45ce88b98d8b3198062aeb3bef139319d877044efae641bca74338c76682e10`.

```sh
node docs/evidence/knorvia-list-saved-workflows-model-fast-receipt-check-20261001.mjs --emitted --logs
```

Omit optional `--logs` without original local logs, or `--emitted` until exact core emission. Mandatory source/frozen/protected Git checks remain. The previous GetWorkflowRun checkpoint/evidence stays immutable and should be checked at its original e32191b checkpoint; this later receipt separately binds its unchanged source/evidence inputs.

Ledger/history show upstream-modified/null review and snapshot-only handler history. Publisher metadata is manifest evidence, not newly verified publisher bytes. Source was read. XML/model syntax, prose, compatibility expressions, archived source and earlier exposed fixture patterns retain attribution; hashes, names and tests do not prove authorship. Candidate statuses remain unresolved; no clean-room or whole-file MIT claim. Historical branch material registers 27 and root's parent-reported 26 remain separate. Root owns licence decisions. A future bounded separation of retained prose/archives could aid review without such production changes here.

Remaining inherited responsibility: output admission/empty prose and filesystem schema/cwd/store orchestration, plus lower store/security policy. All accepted earlier handlers and root runtime admission/queue are untouched. Two bounded checkpoints are complete; await the next assignment in this same conversation after clean push.
