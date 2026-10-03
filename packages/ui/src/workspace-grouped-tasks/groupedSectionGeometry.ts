// SPDX-License-Identifier: Apache-2.0
// Source-exposed geometry plan; numeric/UI compatibility expressions are retained material.
export type GroupedLayoutBox = { height: number; left: number; top: number };
export type GroupedLayoutMotion = { x: number; y: number; heights: [number, number] | null };
export type GroupedStickyFact = {
  id: string | null;
  collapsed: boolean;
  bottom: number;
  header: { top: number; height: number } | null;
};

/** Geometry is a command plan; no DOM, animation or accepted view lives here. */
export function projectGroupedLayoutMotion(
  previous: GroupedLayoutBox,
  next: GroupedLayoutBox,
  layout: boolean,
): GroupedLayoutMotion | null {
  const x = previous.left - next.left,
    y = previous.top - next.top;
  const size = layout && Math.abs(previous.height - next.height) >= 0.5;
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && !size) return null;
  return { x, y, heights: size ? [previous.height, next.height] : null };
}

export function projectStickyGroupedId(
  facts: readonly GroupedStickyFact[],
  containerTop: number,
): string | null {
  // Reverse selection preserves the original last eligible DOM item without mutating input.
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index]!;
    if (!fact.id || fact.collapsed || !fact.header) continue;
    const edge = containerTop + (fact.header.height || 32) + 0.5;
    if (fact.header.top < containerTop - 0.5 && fact.bottom > edge) return fact.id;
  }
  return null;
}
