// SPDX-License-Identifier: Apache-2.0

import { UNPHASED_ID } from "./constants.js";
import type { PhaseInfo } from "./causality-order.js";
import type { Src } from "./flow-graph.js";

interface StrandPark {
  alongside: (phase: string, regions: readonly string[]) => string[];
  discard: () => void;
  drain: () => Src[];
  join: (regions: readonly string[]) => Src[];
  park: (region: string, exits: readonly Src[], phases: readonly string[]) => void;
}

interface ParkedStrand {
  exits: Src[];
  phases: readonly string[];
}

// Exits wait under the strand's region id until the barrier that joins it, or until
// the root drains whatever nobody awaited. A mark reads the same table for `alongside`.
export function createStrandPark(phases: readonly PhaseInfo[]): StrandPark {
  return new StrandTable(phases);
}

class StrandTable implements StrandPark {
  private readonly parked = new Map<string, ParkedStrand>();
  private readonly at: (id: string) => number;

  constructor(phases: readonly PhaseInfo[]) {
    this.at = phaseOrder(phases);
  }

  alongside(phase: string, regions: readonly string[]): string[] {
    const enclosing = new Set<string>();
    for (let index = 0; index < regions.length; index += 1) {
      const id = regions[index];
      if (id !== undefined) enclosing.add(id);
    }
    const running = new Set<string>();
    for (const [region, strand] of this.parked) {
      if (enclosing.has(region)) continue;
      for (let index = 0; index < strand.phases.length; index += 1) {
        const id = strand.phases[index];
        if (id !== undefined && id !== phase) running.add(id);
      }
    }
    const ids = [...running];
    ids.sort((left, right) => this.at(left) - this.at(right));
    return ids;
  }

  discard(): void {
    this.parked.clear();
  }

  drain(): Src[] {
    const exits: Src[] = [];
    for (const strand of this.parked.values()) pushAll(exits, strand.exits);
    this.parked.clear();
    return exits;
  }

  join(regions: readonly string[]): Src[] {
    const exits: Src[] = [];
    for (let index = 0; index < regions.length; index += 1) {
      const region = regions[index];
      if (region === undefined) continue;
      const strand = this.parked.get(region);
      if (strand === undefined) continue;
      this.parked.delete(region);
      pushAll(exits, strand.exits);
    }
    return exits;
  }

  park(region: string, exits: readonly Src[], phaseIds: readonly string[]): void {
    this.parked.set(region, { exits: copySrcs(exits), phases: copyNames(phaseIds) });
  }
}

function phaseOrder(phases: readonly PhaseInfo[]): (id: string) => number {
  const rank = new Map<string, number>();
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (phase !== undefined) rank.set(phase.id, index + 1);
  }
  rank.set(UNPHASED_ID, 0);
  return (id: string): number => {
    const placed = rank.get(id);
    return placed === undefined ? rank.size : placed;
  };
}

function copySrcs(exits: readonly Src[]): Src[] {
  const copy: Src[] = [];
  pushAll(copy, exits);
  return copy;
}

function copyNames(phaseIds: readonly string[]): string[] {
  const copy: string[] = [];
  for (let index = 0; index < phaseIds.length; index += 1) {
    const id = phaseIds[index];
    if (id !== undefined) copy.push(id);
  }
  return copy;
}

function pushAll(into: Src[], exits: readonly Src[]): void {
  for (let index = 0; index < exits.length; index += 1) {
    const exit = exits[index];
    if (exit !== undefined) into.push(exit);
  }
}
