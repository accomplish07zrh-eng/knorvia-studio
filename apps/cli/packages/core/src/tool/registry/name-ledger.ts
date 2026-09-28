// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolEntry } from "../types.js";

type Canonical = { kind: "tool"; name: string; entry: ToolEntry };
type Alias = { kind: "alias"; name: string; target: string };
type Binding = Canonical | Alias;
interface Slot {
  tool?: Canonical;
  alias?: Alias;
}

/** The ordered bindings are the facts; name slots only index those same objects. */
export class NameLedger {
  private readonly bindings = new Set<Binding>();
  private readonly slots = new Map<string, Slot>();

  tool(name: string): ToolEntry | undefined {
    return this.slots.get(name)?.tool?.entry;
  }
  aliasTarget(name: string): string | undefined {
    return this.slots.get(name)?.alias?.target;
  }
  hasTool(name: string): boolean {
    return this.slots.get(name)?.tool !== undefined;
  }

  putTool(name: string, entry: ToolEntry): void {
    const slot = this.slot(name);
    if (slot.tool) {
      slot.tool.entry = entry;
      return;
    }
    slot.tool = { kind: "tool", name, entry };
    this.bindings.add(slot.tool);
  }

  putAlias(name: string, target: string): void {
    const slot = this.slot(name);
    if (slot.alias) {
      slot.alias.target = target;
      return;
    }
    slot.alias = { kind: "alias", name, target };
    this.bindings.add(slot.alias);
  }

  dropTool(name: string): void {
    this.drop(name, "tool");
  }
  dropAlias(name: string): void {
    this.drop(name, "alias");
  }

  *aliases(): Generator<[string, string]> {
    for (const binding of this.bindings) {
      if (binding.kind === "alias") yield [binding.name, binding.target];
    }
  }

  names(): string[] {
    return this.canonicals().map((binding) => binding.name);
  }
  entries(): ToolEntry[] {
    return this.canonicals().map((binding) => binding.entry);
  }

  private canonicals(): Canonical[] {
    return [...this.bindings].filter((binding): binding is Canonical => binding.kind === "tool");
  }

  private slot(name: string): Slot {
    let slot = this.slots.get(name);
    if (!slot) {
      slot = {};
      this.slots.set(name, slot);
    }
    return slot;
  }

  private drop(name: string, kind: keyof Slot): void {
    const slot = this.slots.get(name);
    const binding = slot?.[kind];
    if (!slot || !binding) return;
    this.bindings.delete(binding);
    delete slot[kind];
    if (!slot.tool && !slot.alias) this.slots.delete(name);
  }
}
