# Background resource owner checkpoint

Branch `parallel/cli-tools-fast-20261001`, draft PR11. Complete tracker candidate installed at `f8b63cd274300e943fe811d79eda75fac00e052f`, following contract/oracle freeze `9247089` and sealed draft/red-proof commit `d58543b`. No accepted complete-owner conflict located; exact parent allocation governs, not absence of a receipt.

Own only `tool/executor/background-tasks.ts`, `background-tracker-projection.ts` and `background-tracker-notification.ts`, plus named packet/tests/evidence. Tracker retains one admission set and each attempt's poll/publication/timer lifetime. Synchronous payload/text/manifest projections remain below its native publication boundaries. Ports and registry stay live existing owners; no provider cache, new retry, grant, generation fence or termination policy.

Initial full native draft preceded curator comparison, read eight body-free source-derived inputs and four functional clarifications, and inherited prior author-packet context. Shared-executor access restrictions were instruction-only. The source-exposed curator corrected four demonstrated regressions: extra no-source await, async payload failure settlement, wrongly narrowed supersession, and conflated event/text/origin fallback. [Original failures and corrections](evidence/background-tracker-checks-20261003/corrections.md) remain immutable; no unchanged restricted-authorship or clean-room claim.

Final actual-emitted checks: **6/6 original groups +1/1 appended group (four targeted comparisons)**. Real external-tracking executor consumer is included in the six. Historical baseline runs are separate, not extra final coverage. Root TS6.0.2 proof passes zero diagnostics, exact current JS/declarations/public API, strict wrong/missing artifact rejection and 698 protected-source matches. Initial proof accidentally resolved CLI TS5.9.3; its equal artifacts/zero diagnostics and routing correction are preserved. Owned lint: seven files/94 rules, zero warnings/errors, 400-line rule retained. Scoped format and architecture pass. Root configured lint excludes CLI and found zero files; it is not reported as a pass.

Final source SHA256:

- `background-tasks.ts`: `c67312f13e0864c6ea96b1bfc19db8ea468bf1901a94c70ed19c6e5bba2c0d83`
- `background-tracker-projection.ts`: `468835c4dfac2951ef196a0d24cd976a41775ac64d3cd3ff0e5a8ec078c52422`
- `background-tracker-notification.ts`: `70adb4131b236266947fc77b7546b907ee846ed0eb5c3a0b88a9d24ba10c5c44`

[Strict current manifest](evidence/knorvia-background-tracker-current-20261003.json) SHA256 `e3a8f212f9a30970acdffbefb1f7198c859fb698da87a689ed3fd57f222b1453`; [receipt](evidence/knorvia-background-tracker-owner-20261003.json) binds all evidence and commands below reproduce scoped checks:

```sh
node apps/cli/packages/core/test/background-tracker-artifact-proof-20261003.mjs
node --experimental-vm-modules apps/cli/packages/core/test/background-tracker-safety-20261003.mjs current
node --experimental-vm-modules apps/cli/packages/core/test/background-tracker-correction-proof-20261003.mjs current
```

Fixed protocol/type/schema/log/model prose and conventional read/receiver/await/claim combinations remain compatibility material. Some callback/branch sequencing closely corresponds to the predecessor. New drafts and changed hashes do not decide independent expression or licensing; parent review remains required. No discretionary developer comments remain in these three modules, but that does not close whole-file rights. Lower helpers, root registry/hydration, prior TurnMachine HOLD and all other protected source hashes remain unchanged.

No live task/process/provider/grant/user-data operation occurred. Ordinary suites/source replay/full invocation-deadline-telemetry checks, broad builds/types and native/Windows acceptance are deferred per speed-first instruction. No executor blocker; no merge, licence grant or publication claim. Current Sol/high/Fast ON is parent-verified, with no retroactive verification of earlier OFF rounds.
