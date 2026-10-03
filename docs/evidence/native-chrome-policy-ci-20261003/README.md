# Chrome policy CI fixture repair

Exact current source input: `902e35c6dbcfa4b829270352fecf03ebc07b219f`.
The actual [Windows job](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37123232166/job/111203311217)
triggered at ad712690 but checked `7bd43bfd70486ef0e9b90bc3e2174cd81130404d`.
The four production files and old fixture have identical bytes at all three inputs,
as bound in `source-bindings.json`. Exact two failure excerpts are retained.

Both registry responses used `/` while the expected path used native `join`.
Production correctly preserves the expanded policy spelling. Only the two fixture
inputs now use native `join`; their original expected values and assertions remain.
A new scene strictly compares all source fields, raw mixed separators, unknown
variables, separate joined profilePath, both hive queries and unchanged cookie bytes.
All22 other existing scene bodies and four production owners remain byte-identical.

Pinned Node24.14.0 Linux x64: old selected scenes **2/2 pass**; repaired scenes plus
the new control **3/3 pass**, zero failures/skips. This does not reproduce the actual
Windows failure on Linux and does not establish Windows acceptance. Matching real
Windows CI remains pending after integration; no Windows stage was skipped or
weakened. System commands are mocked; synthetic profiles and outer data are removed.

Root typecheck, lint, changed architecture, fixture oxlint and two-file formatting
passed. Root lint ran before adding these new snapshots: existing5805 frozen files
passed integrity and the unchanged package evidence owner emitted one warning,
zero errors. Integrator must register new frozen evidence before claiming final-tree
quality success. Source/spec and actual outputs are in `commands.json`/`result.json`.

After adding the own evidence, root lint was actually rerun and exits1 at the
unregistered frozen-evidence prerequisite; lint itself did not run. The captured
final failure remains in `root-lint-final.log`. No shared registry/checker was
changed or bypassed. New snapshots and checksum manifests need integrator intake.

Final packaging is deliberately held until the parent supplies the next unified
exact SHA with this repair and zombie cleanup. The separate fresh ad712690 TUI
import failure also requires CLI ownership; the intermediate package receipts are
retained in the sibling `native-packaged-retest-ad712690-20261003` directory.
No production/UI/protocol/schema/licensing/global inventory change or new
independent-authorship/rights acceptance is claimed here.
