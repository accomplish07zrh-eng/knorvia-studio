// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

export interface PortCall {
  readonly args: readonly unknown[];
  readonly name: string;
}

export interface InstalledRecordFixture {
  readonly id: string;
  readonly installPath: string;
  readonly installedAt: string;
  readonly marketplace: string;
  readonly name: string;
  readonly scope: "user" | "workspace";
  readonly version: string;
}

export interface TestPortState {
  bundledRoots: string[] | undefined;
  calls: PortCall[];
  dataDirByPluginId: Map<string, string>;
  installedRecords: InstalledRecordFixture[];
  resolvedInstalledRoots: Map<string, string>;
  scanFaults: Map<string, NodeJS.ErrnoException>;
}

const PORT_SYMBOL = Symbol.for("knorvia.pluginDiscoveryTestPort.v1");

interface PortGlobal {
  [PORT_SYMBOL]?: TestPortState;
}

export function createPortState(): TestPortState {
  return {
    bundledRoots: undefined,
    calls: [],
    dataDirByPluginId: new Map<string, string>(),
    installedRecords: [],
    resolvedInstalledRoots: new Map<string, string>(),
    scanFaults: new Map<string, NodeJS.ErrnoException>(),
  };
}

export function installPortState(state: TestPortState): void {
  (globalThis as PortGlobal)[PORT_SYMBOL] = state;
}

export function currentPortState(): TestPortState {
  const state = (globalThis as PortGlobal)[PORT_SYMBOL];
  if (state === undefined) {
    throw new Error("Plugin-discovery test port state is not installed");
  }
  return state;
}

export function recordPortCall(name: string, ...args: readonly unknown[]): void {
  currentPortState().calls.push({ args, name });
}

export function scanSkillFilesNoFollow(rootPath: string): string[] {
  recordPortCall("scanSkillFilesUnderRootSync", rootPath);
  const state = currentPortState();
  const exactFault = state.scanFaults.get(resolve(rootPath));
  if (exactFault !== undefined) {
    throw exactFault;
  }

  const found = new Map<string, string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile() && entry.name === "SKILL.md") {
        found.set(realpathSync(path), path);
      }
    }
  };
  visit(rootPath);
  return [...found.values()].sort();
}
