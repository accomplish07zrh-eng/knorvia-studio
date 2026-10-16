// SPDX-License-Identifier: Apache-2.0

export type RegionKind = "seq" | "parallel" | "loop" | "fanout" | "branch" | "shared";

export type StructuralRegionKind = "choice" | "call" | "try" | "attempt" | "catch" | "finally";

export type TraceRegionKind = RegionKind | StructuralRegionKind;

const STRUCTURAL_REGION_SET: ReadonlySet<StructuralRegionKind> = new Set<StructuralRegionKind>(["choice", "call", "try", "attempt", "catch", "finally"]);

export function isStructuralRegionKind(kind: TraceRegionKind): kind is StructuralRegionKind {
  return STRUCTURAL_REGION_SET.has(kind as StructuralRegionKind);
}

export const UNPHASED_ID = "unphased";

export type JumpKind = "continue" | "break" | "return" | "throw" | "recur";
