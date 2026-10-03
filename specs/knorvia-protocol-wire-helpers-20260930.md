# Protocol v4 pure wire helpers

2026-09-30. Bounded protocol/shared track, based on draft PR 7 at
`8e8f6310d5ca70a57a454054e44f7b61db30b83f`.

## Ownership and migration boundary

Only `packages/shared/src/protocol-v4/wire-binary.ts`, `wire-codec.ts`, and
`wire-reassembly.ts` are implementation targets. They are pure calls: byte
conversion, physical envelope planning, and batch reconstruction. The existing
`TopicWireFrameAssembler` owns incremental staging, ordinals, expiry and resource
release; the gateway owns reservations; neither changes here. Schemas, exports,
limits, UI, userdata, inventories, lockfiles and global configuration stay intact.

```text
gateway reservation -> pure encoder -> physical topic frames
                                         |
ownership filter -> existing assembler -> one logical frame -> existing apply
                                         |
                      pure batch reconstruction (validation/test callers)
```

Desktop continuous and mobile replayable delivery retain their existing owner,
sequence, reservation and recovery semantics. `initial`, `online` and `recovery`
remain explicit frame metadata. No transport or persistence is introduced.

## Frozen public behavior

- Export names, TypeScript declarations, frame property order, schema expression,
  complete-frame identity, checksum and exact fragment bytes remain compatible.
- CRC-32 uses reflected polynomial `0xedb88320`, initial/final inversion, eight
  lowercase hexadecimal digits. Base64 accepts the existing schema, including
  noncanonical padding bits; empty encoding is `""` but empty decoding is `null`.
  No Buffer, Node imports or runtime IO enter production helpers.
- JSON serialization follows native `JSON.stringify` and `TextEncoder`, including
  omitted fields, `toJSON`, lone surrogates, undefined's empty byte output and
  native cyclic/BigInt exceptions. Exceptions from measurement and schema calls
  propagate. Limits resolve nullishly, validate finite positive numbers, floor,
  and clamp to existing hard limits; positive fractions below one become zero.
- Encoder checks assembly bytes before measuring a complete frame. Fragment
  planning probes conservative metadata (`fragmentCount = logicalBytes`, largest
  index) using the same integer bisection and measurement order. Each emitted
  frame is measured again. Exact fragments and callback observations are frozen.
- Encoding errors keep `name = TopicWireFrameEncodingError`, `message` and
  enumerable `reasonCode`: invalid-limit, assembly-too-large, envelope-too-large,
  and fragment-count-exceeded. No new serialized error fields are added.
- Envelope budgets retain NDJSON's trailing newline, RPC array/int/object tags
  and VQL lengths, worst-case MAX_SAFE_INTEGER event ID, the 13-byte socket
  header, and conservative mobile Base64 plus fixed maximum-length relay IDs.
  This logical budget does not replace the acknowledged raw relay adapter's
  separate physical budget. Real RPC serialization is a consumer check.
- Batch reconstruction keeps current result shapes and ordered failure
  precedence: empty; invalid limit; complete metadata/length/schema; fragment
  count/advertised length; per-fragment metadata/Base64/duplicate conflict/
  cumulative limits; missing indexes; total length; checksum; fatal UTF-8;
  JSON; inner routing metadata; schema. Missing indexes are ascending. Exact
  duplicate chunks are idempotent, including alternate accepted Base64 spellings.
- Batch calls do not mutate inputs or retain state. No logical frame is produced
  until all byte, routing and payload checks pass. No schema tightening is hidden
  in this rewrite: callers still validate wire shape before batch reconstruction.

## Acceptance fixed before implementation

`packages/shared/test/protocol-wire-contract.test.ts` runs the same cases against
`src` and emitted `dist`. Its checked-in JSON observations come from the exact
old source and are independently checked against old dist before implementation.
Inputs cover binary boundaries, Unicode and JSON, physical budgets, all encoding
errors, every batch result/fault, duplicate/order handling and multi-fault
precedence. Native Node Base64/CRC checks supply independent binary oracles.

`protocol-wire-consumers.test.ts` exercises the unchanged public protocol entry,
incremental assembler, and real RPC serializer for desktop/mobile budgets.
Compare declarations before/after; compile shared; run scoped contract/consumer
tests on source/dist, root typecheck and lint, formatting and changed architecture.
Avoid duplicate full application suites. No native GUI or cross-platform claim.

## Provenance constraint

Old source was read to extract behavior and failure order. This is not a
clean-room implementation. No accepted independent review exists for these
three paths at the baseline. They retain the root Apache-2.0 scope, all notices
and existing third-party obligations. `wire-codec.ts` has a recorded partial
Visual Studio Code IPC attribution; measuring an existing format does not
authorize erasing that attribution or licensing the whole file as MIT.
The implementation will use table-driven CRC, native platform Base64, a separate
envelope budget model and staged reconstruction, with fixed interoperability
expressions disclosed. Proposed inventory evidence goes to the integrator;
this branch does not edit shared review registries or grant production MIT.
