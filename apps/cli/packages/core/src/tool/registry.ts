// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelToolContract } from "@knorvia/contracts";
import type { ToolEntry, ToolMetadata } from "./types.js";
import { NameLedger } from "./registry/name-ledger.js";
import { modelContracts } from "./registry/model-contracts.js";

export interface ToolRegistry {
  register(entry: ToolEntry, options?: ToolRegistryRegisterOptions): void;
  unregister(name: string): void;
  get(name: string): ToolEntry | undefined;
  has(name: string): boolean;
  list(): string[];
  getMetadata(name: string): ToolMetadata | undefined;
  toContracts(): ModelToolContract[];
}
export interface ToolRegistryRegisterOptions {
  silentDuplicateWarning?: boolean;
}

export class ToolRegistryImpl implements ToolRegistry {
  private readonly names = new NameLedger();

  register(entry: ToolEntry, options: ToolRegistryRegisterOptions = {}): void {
    const displaced = this.names.aliasTarget(entry.metadata.name);
    if (displaced) {
      this.names.dropAlias(entry.metadata.name);
      if (options.silentDuplicateWarning !== true) {
        // 先取得日志方法，再求值消息 getter，保留 console receiver 与同步异常阶段。
        console.warn(
          `Tool ${entry.metadata.name} replaces alias previously targeting ${displaced}`,
        );
      }
    }
    if (this.names.hasTool(entry.metadata.name) && options.silentDuplicateWarning !== true) {
      console.warn(`Tool ${entry.metadata.name} already registered, overwriting`);
    }
    for (const [alias, target] of this.names.aliases()) {
      if (target === entry.metadata.name) this.names.dropAlias(alias);
    }
    this.names.putTool(entry.metadata.name, entry);
    for (const alias of entry.aliases ?? []) {
      const target = this.names.aliasTarget(alias);
      const conflict =
        alias === entry.metadata.name ||
        this.names.hasTool(alias) ||
        (target !== undefined && target !== entry.metadata.name);
      if (conflict) {
        if (options.silentDuplicateWarning !== true) {
          console.warn(`Tool alias ${alias} conflicts with an existing tool or alias; skipping`);
        }
      } else {
        this.names.putAlias(alias, entry.metadata.name);
      }
    }
  }

  unregister(name: string): void {
    // 空名目标在旧合同中不走 alias 删除分支；槽位必须允许它与同名 canonical 共存。
    if (this.names.aliasTarget(name)) {
      this.names.dropAlias(name);
      return;
    }
    this.names.dropTool(name);
    for (const [alias, target] of this.names.aliases()) {
      if (target === name) this.names.dropAlias(alias);
    }
  }

  get(name: string): ToolEntry | undefined {
    return this.names.tool(this.names.aliasTarget(name) ?? name);
  }
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
  list(): string[] {
    return this.names.names();
  }
  getMetadata(name: string): ToolMetadata | undefined {
    return this.get(name)?.metadata;
  }
  toContracts(): ModelToolContract[] {
    return modelContracts(this.names.entries());
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistryImpl();
}
