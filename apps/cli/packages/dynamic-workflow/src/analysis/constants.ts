// SPDX-License-Identifier: Apache-2.0

// Execution region classifications for dynamic workflow trace evaluation.
export type RegionKind = "seq" | "parallel" | "loop" | "fanout" | "branch" | "shared";

// Structural control-flow regions that encapsulate nested sub-regions.
export type StructuralRegionKind = "choice" | "call" | "try" | "attempt" | "catch" | "finally";

// Union of all region kinds tracked in ordering traces.
export type TraceRegionKind = RegionKind | StructuralRegionKind;

// Default stage identifier when no phase() marker has been reached.
export const UNPHASED_ID = "unphased";

// Jump classifications for non-linear control flow jumps.
export type JumpKind = "continue" | "break" | "return" | "throw" | "recur";

export function isStructuralRegionKind(
  regionKind: TraceRegionKind,
): regionKind is StructuralRegionKind {
  switch (regionKind) {
    case "choice":
    case "call":
    case "try":
    case "attempt":
    case "catch":
    case "finally":
      return true;
    default:
      return false;
  }
}
