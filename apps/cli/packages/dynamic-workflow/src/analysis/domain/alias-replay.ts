// SPDX-License-Identifier: Apache-2.0

import type { AbstractValue } from "../domain.js";
import {
  Exactness,
  ValueFold,
  ValueJoin,
  claim,
  ensureField,
  grewFrom,
  overCap,
} from "./lattice.js";

interface FieldWave {
  aliases: Set<AbstractValue>;
  member: string;
  payload: AbstractValue;
  seen: Set<AbstractValue>;
  depth: number;
}

interface NodeWave {
  aliases: Set<AbstractValue>;
  payload: AbstractValue;
  seen: Set<AbstractValue>;
}

export class AliasReplay {
  // A field write also reaches `target[key]` for every place the container may be.
  // Exactness is cleared first: the write happens on one arm only. The container's
  // own slot is updated by the caller and stays exact. Chained aliases recurse, and
  // past the depth cap the write smears into the target's occurrences.
  static write(container: AbstractValue, key: string, value: AbstractValue): boolean {
    const aliases = container.mayAlias;
    if (aliases === undefined) return false;
    return AliasReplay.fields({
      aliases,
      depth: 0,
      member: key,
      payload: Exactness.cleared(value),
      seen: new Set(),
    });
  }

  private static fields(wave: FieldWave): boolean {
    return grewFrom(wave.aliases, (target) => {
      if (!claim(wave.seen, target)) return false;
      if (overCap(wave.depth)) return ValueFold.into(target, wave.payload, new Set());
      const direct = ValueJoin.into(ensureField(target, wave.member), wave.payload, 0);
      const nested = target.mayAlias;
      if (nested === undefined) return direct;
      const deeper = AliasReplay.fields({
        aliases: nested,
        depth: wave.depth + 1,
        member: wave.member,
        payload: wave.payload,
        seen: wave.seen,
      });
      return direct || deeper;
    });
  }

  // In-place mutation (`push`, `Map.set`): smear the collapsed value into each alias.
  static smear(container: AbstractValue, value: AbstractValue): boolean {
    const aliases = container.mayAlias;
    if (aliases === undefined) return false;
    return AliasReplay.nodes({
      aliases,
      payload: Exactness.cleared(ValueFold.fresh(value)),
      seen: new Set(),
    });
  }

  private static nodes(wave: NodeWave): boolean {
    return grewFrom(wave.aliases, (target) => {
      if (!claim(wave.seen, target)) return false;
      const direct = ValueJoin.into(target, wave.payload, 0);
      const nested = target.mayAlias;
      if (nested === undefined) return direct;
      const deeper = AliasReplay.nodes({ aliases: nested, payload: wave.payload, seen: wave.seen });
      return direct || deeper;
    });
  }
}

// Shallow copy: `target` adopts each of `source`'s field objects by reference, so a
// later write through either name hits the same node. A colliding field is merged
// into the source's field first (runtime overwrites; gen-only keeps both), then both
// names share that object. Only the top level is shared. The merge's own growth is
// not reported — callers that must not spin the fixpoint rely on that.
export function shareFields(target: AbstractValue, source: AbstractValue): boolean {
  const adopted = [...source.fields].filter(
    ([key, incoming]) => target.fields.get(key) !== incoming,
  );
  for (const [key, incoming] of adopted) {
    const prior = target.fields.get(key);
    if (prior !== undefined) ValueJoin.into(incoming, prior, 0);
    target.fields.set(key, incoming);
  }
  return adopted.length > 0;
}
