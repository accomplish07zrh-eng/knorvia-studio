// SPDX-License-Identifier: Apache-2.0

import {
  VALUE_DEPTH_CAP,
  collapseInto,
  liveField,
  mergeBound,
  type AbstractValue,
  type Placeholder,
  type TaintOcc,
} from "../domain.js";

// Monotone join of labels, formals, functions, aliases, and named fields.
// Past the depth cap the domain folds structure into labels. Bind-prefix length
// is also the domain's policy: this join calls mergeBound instead of growing it.

function labelKey(site: string, port: number | undefined): string {
  const suffix = port === undefined ? "" : String(port);
  return [site, suffix].join("|");
}

export function overCap(depth: number): boolean {
  return depth >= VALUE_DEPTH_CAP;
}

export function grewFrom<T>(items: Iterable<T>, step: (item: T) => boolean): boolean {
  let grew = false;
  for (const item of items) {
    if (step(item)) grew = true;
  }
  return grew;
}

// Returns whether this is the first time `node` is seen. The set is the cycle brake
// for a field that points back at its container.
export function claim(seen: Set<AbstractValue>, node: AbstractValue): boolean {
  if (seen.has(node)) return false;
  seen.add(node);
  return true;
}

export class OccurrenceJoin {
  static admit(host: AbstractValue, occ: TaintOcc): boolean {
    if (occ.port === undefined) return OccurrenceJoin.cover(host, occ);
    return OccurrenceJoin.keep(host, occ);
  }

  // A portless label erases every ported label of the same site and ORs exactness.
  private static cover(host: AbstractValue, occ: TaintOcc): boolean {
    const doomed = [...host.occs].filter(
      ([, row]) => row.site === occ.site && row.port !== undefined,
    );
    const exact = doomed.reduce((bit, [, row]) => bit || row.exact, occ.exact);
    for (const [key] of doomed) host.occs.delete(key);
    const stored = OccurrenceJoin.store(host, { exact, site: occ.site });
    return stored || doomed.length > 0;
  }

  // A ported label is redundant once a portless label of that site is present.
  // Exactness still upgrades the covering label.
  private static keep(host: AbstractValue, occ: TaintOcc): boolean {
    const cover = host.occs.get(labelKey(occ.site, undefined));
    if (cover === undefined) return OccurrenceJoin.store(host, occ);
    const raised = occ.exact && cover.exact === false;
    if (raised) cover.exact = true;
    return raised;
  }

  private static store(host: AbstractValue, occ: TaintOcc): boolean {
    const key = labelKey(occ.site, occ.port);
    const prior = host.occs.get(key);
    if (prior === undefined) {
      host.occs.set(key, { exact: occ.exact, port: occ.port, site: occ.site });
      return true;
    }
    const raised = occ.exact && prior.exact === false;
    if (raised) prior.exact = true;
    return raised;
  }
}

export class PlaceholderJoin {
  static key(ph: Placeholder): string {
    return String(ph.fnId) + ":" + String(ph.param);
  }

  static admit(host: AbstractValue, ph: Placeholder): boolean {
    const key = PlaceholderJoin.key(ph);
    const prior = host.phs.get(key);
    if (prior === undefined) {
      const row: Placeholder = { fnId: ph.fnId, param: ph.param };
      if (ph.rest === true) row.rest = true;
      host.phs.set(key, row);
      return true;
    }
    // A later rest witness must stick. A non-rest witness must not clear it.
    const raised = ph.rest === true && prior.rest !== true;
    if (raised) prior.rest = true;
    return raised;
  }
}

function absorbFunctions(host: AbstractValue, source: AbstractValue): boolean {
  const fresh = [...source.fns].filter((fn) => host.fns.has(fn) === false);
  for (const fn of fresh) host.fns.add(fn);
  return fresh.length > 0;
}

function absorbAliases(host: AbstractValue, incoming: Set<AbstractValue>): boolean {
  const slot = host.mayAlias ?? new Set<AbstractValue>();
  if (host.mayAlias === undefined) host.mayAlias = slot;
  let grew = false;
  for (const alias of incoming) {
    if (slot.has(alias)) continue;
    slot.add(alias);
    grew = true;
  }
  return grew;
}

// Occurrences, placeholders, and functions. Structure is handled by the caller.
// The fold uses the same flat join, so this is shared with the domain module.
export function absorbFlat(host: AbstractValue, source: AbstractValue): boolean {
  const labels = grewFrom(source.occs.values(), (occ) => OccurrenceJoin.admit(host, occ));
  const formals = grewFrom(source.phs.values(), (ph) => PlaceholderJoin.admit(host, ph));
  return labels || formals || absorbFunctions(host, source);
}

export class ValueJoin {
  static into(target: AbstractValue, source: AbstractValue, depth: number): boolean {
    // Same object: do not walk. A field that points at its container is stopped by the
    // depth cap, which still smears labels. A visited-set here would hide that growth.
    if (target === source) return false;
    const flat = absorbFlat(target, source);
    const prefix = source.bound === undefined ? false : mergeBound(target, source.bound, depth);
    const aliases = source.mayAlias === undefined ? false : absorbAliases(target, source.mayAlias);
    const structure = ValueJoin.fields(target, source, depth);
    return flat || prefix || aliases || structure;
  }

  private static fields(target: AbstractValue, source: AbstractValue, depth: number): boolean {
    if (overCap(depth)) {
      return grewFrom(source.fields.values(), (field) => collapseInto(target, field));
    }
    return grewFrom(source.fields, ([key, field]) =>
      ValueJoin.into(liveField(target, key), field, depth + 1),
    );
  }
}
