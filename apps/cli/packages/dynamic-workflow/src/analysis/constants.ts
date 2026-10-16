// SPDX-License-Identifier: Apache-2.0

// Kinds the ordering walk records as it steps through the script.
const WALK_REGION_KINDS = ["seq", "loop", "fanout", "branch"] as const;

// `parallel` is derived from incomparability, and `shared` is held for a later cap.
// Both stay nameable so callers do not invent a second vocabulary.
const RESERVED_REGION_KINDS = ["parallel", "shared"] as const;

type WalkRegionKind = (typeof WALK_REGION_KINDS)[number];
type ReservedRegionKind = (typeof RESERVED_REGION_KINDS)[number];

export type RegionKind = WalkRegionKind | ReservedRegionKind;

// Nodes the walk always nested through. Causality looks through them; the
// control-flow projection is what records them.
// A choice is one conditional whose arms are branch children. A call is one
// inlined helper, which is also where a return lands. A try is stored as the
// statement plus its attempt, catch, and finally clauses.
const CHOICE_KINDS = ["choice"] as const;
const CALL_KINDS = ["call"] as const;
const TRY_KINDS = ["try", "attempt", "catch", "finally"] as const;

type ChoiceKind = (typeof CHOICE_KINDS)[number];
type CallKind = (typeof CALL_KINDS)[number];
type TryKind = (typeof TRY_KINDS)[number];

export type StructuralRegionKind = ChoiceKind | CallKind | TryKind;

// Every label a trace region can carry, including the structural nodes above.
export type TraceRegionKind = RegionKind | StructuralRegionKind;

const STRUCTURAL_REGION_KINDS: ReadonlySet<string> = new Set<StructuralRegionKind>([
  ...CHOICE_KINDS,
  ...CALL_KINDS,
  ...TRY_KINDS,
]);

export function isStructuralRegionKind(
  regionKind: TraceRegionKind,
): regionKind is StructuralRegionKind {
  return STRUCTURAL_REGION_KINDS.has(regionKind);
}

// Steps issued before the script's first phase() marker use this id.
export const UNPHASED_ID = "unphased";

// Continue and break stay inside the enclosing loop. The other three leave it.
const LOOP_JUMPS = ["continue", "break"] as const;
const EXIT_JUMPS = ["return", "throw", "recur"] as const;

type LoopJump = (typeof LOOP_JUMPS)[number];
type ExitJump = (typeof EXIT_JUMPS)[number];

export type JumpKind = LoopJump | ExitJump;
