// SPDX-License-Identifier: Apache-2.0

import type ts from "typescript";
import { VALUE_DEPTH_CAP, type AbstractValue, type Placeholder, type TaintOcc } from "../domain.js";

// Join, fold, and exactness for one abstract value. Structure past the depth cap
// is smeared into labels so a cyclic heap cannot mint a fresh node every pass.

export function freshValue(): AbstractValue {
  const fields = new Map<string, AbstractValue>();
  const fns = new Set<ts.Node>();
  const occs = new Map<string, TaintOcc>();
  const phs = new Map<string, Placeholder>();
  return { fields, fns, occs, phs };
}

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

function grewAt<T>(items: readonly T[], step: (item: T, index: number) => boolean): boolean {
  let grew = false;
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (item !== undefined && step(item, index)) grew = true;
    index += 1;
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
function absorbFlat(host: AbstractValue, source: AbstractValue): boolean {
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
    const prefix =
      source.bound === undefined ? false : ValueJoin.prefix(target, source.bound, depth);
    const aliases = source.mayAlias === undefined ? false : absorbAliases(target, source.mayAlias);
    const structure = ValueJoin.fields(target, source, depth);
    return flat || prefix || aliases || structure;
  }

  private static fields(target: AbstractValue, source: AbstractValue, depth: number): boolean {
    if (overCap(depth)) {
      return grewFrom(source.fields.values(), (field) => ValueFold.into(target, field, new Set()));
    }
    return grewFrom(source.fields, ([key, field]) =>
      ValueJoin.into(ensureField(target, key), field, depth + 1),
    );
  }

  static prefix(
    target: AbstractValue,
    sourceBound: readonly AbstractValue[],
    depth: number,
  ): boolean {
    if (overCap(depth)) {
      return grewFrom(sourceBound, (part) => ValueFold.into(target, part, new Set()));
    }
    target.bound ??= [];
    const prefix = target.bound;
    return grewAt(sourceBound, (part, index) => {
      if (overCap(index)) return ValueFold.into(target, part, new Set());
      const prior = prefix[index];
      const created = prior === undefined;
      const slot = prior ?? freshValue();
      if (created) prefix[index] = slot;
      return ValueJoin.into(slot, part, depth + 1) || created;
    });
  }
}

export class ValueFold {
  // Drop field structure. Keep labels, formals, and every nested function. Ports stay
  // until a portless label of the same site subsumes them. Functions ride along so a
  // widened read (`fns[i]`, an iterated element) still dispatches instead of becoming
  // an unknown call. The function set is bounded by the script, so this cannot diverge.
  static into(out: AbstractValue, source: AbstractValue, seen: Set<AbstractValue>): boolean {
    if (!claim(seen, source)) return false;
    const flat = absorbFlat(out, source);
    const nested = grewFrom(source.fields.values(), (field) => ValueFold.into(out, field, seen));
    const prefix = source.bound;
    const bound =
      prefix === undefined ? false : grewFrom(prefix, (part) => ValueFold.into(out, part, seen));
    return flat || nested || bound;
  }

  static fresh(source: AbstractValue): AbstractValue {
    const folded = freshValue();
    ValueFold.into(folded, source, new Set());
    return folded;
  }
}

function carriesPort(value: AbstractValue, site: string): boolean {
  return [...value.occs.values()].some((row) => row.site === site && row.port !== undefined);
}

// Smear container-level labels onto a field read. Skip a portless container label
// when the field already carries a port of that site, or the portless label would
// erase the port. Placeholders always smear. Other fields do not.
export function smearRead(out: AbstractValue, container: AbstractValue): void {
  for (const occ of container.occs.values()) {
    if (occ.port === undefined && carriesPort(out, occ.site)) continue;
    OccurrenceJoin.admit(out, occ);
  }
  for (const ph of container.phs.values()) PlaceholderJoin.admit(out, ph);
}

export class Exactness {
  static cleared(source: AbstractValue): AbstractValue {
    const copy = freshValue();
    ValueJoin.into(copy, source, 0);
    Exactness.scrub(copy, new Set());
    return copy;
  }

  private static scrub(node: AbstractValue, seen: Set<AbstractValue>): void {
    if (!claim(seen, node)) return;
    for (const occ of node.occs.values()) occ.exact = false;
    for (const field of node.fields.values()) Exactness.scrub(field, seen);
    const prefix = node.bound;
    if (prefix === undefined) return;
    for (const part of prefix) Exactness.scrub(part, seen);
  }
}

export function ensureField(container: AbstractValue, key: string): AbstractValue {
  const found = container.fields.get(key);
  if (found !== undefined) return found;
  const created = freshValue();
  container.fields.set(key, created);
  return created;
}
