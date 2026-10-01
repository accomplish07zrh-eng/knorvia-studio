# Corrective terminal lifecycle handoff

Append-only checkpoint after immutable e00c9e70e91d446e780b177c6f403fb27fbddb62 on
parallel/file-watcher-fast-20261001. Root reviewed the prior defects and explicitly authorized
in-scope correction. No new conversation/agent, no root integration-branch write. The original
lifecycle defect spec/handoff and all earlier commits remain unchanged. New intended spec:
specs/knorvia-terminal-lifecycle-corrective-fast-20261001.md. Current live edge assertions will
be updated explicitly for approved corrections; historical failing-behavior evidence remains
available at e00c9e7, without amending it or suppressing final regressions.

Freshness --no-fetch: cached origin/main ahead 84/behind 0; no remote-head freshness claim.
Changed architecture and services context passed before edits; services is legacy/unmanaged.
Source lineage: preceding terminalService blob 694c8b3ac886a69f2cc90791e200d4a9deb69f29,
owner blob 57c16c7e74bd5cdaecf1bcd94f0ea30b281ef094. This is source-exposed work;
no clean-room/whole-service independence/MIT claim. Root alone updates shared provenance.

## Failure-first evidence

Before any production edit, 28 new corrective cases ran against both unchanged source and
strict emitted e00c9e7 consumers: 27 failed, one passed, zero skips/cancellations each, exit
status one as expected. The passing control proves an observed exit followed by a kill error
already avoids a later second kill; other cases expose the specified resource defects.
Two new cases exercise actual binary RPC, one direct real channel exercises pending admission.
All native PTY, filesystem, process, permissions, settings/profile ports are fake. No actual
processes/apps, user data, network shares, host/settings/security changes or outbound network.

Local red evidence: /tmp/knorvia-terminal-lifecycle-corrective-evidence/red-source.log and
red-emitted.log. Source/owner-before snapshots and scoped Git hashes preserve the exact
starting production code. Implementation/final acceptance follows in separate commits.

## Final acceptance and limitations

Pending implementation and final gates. Retain public terminal.ts, launch planner, profiles,
planning interpreters and lazy/native-helper routines. Normal public API/return values,
launch/profile/env semantics and legitimate reuse remain; corrected edge semantics, cleanup
error precedence, diagnostic ownership and unabortable pending-port/RPC aggregate-detail
limitations are explicit in the new spec. LICENSE/NOTICE, preview identity and all 27 material
obligations remain. Native Linux/macOS/Windows PTY, packaged runtime, permission repair and
GUI/font acceptance are not established by Linux fake-port tests. Only the authorized final
lane-branch push uses network. Root reviews/integrates; stop clean in this same thread.
