// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ExecutionEvent } from "@knorvia/contracts";
import { loadConfiguredExecFacade, type BundleAudit } from "./closed-loader.js";
import { FixtureWorld, installFixtureWorld } from "./fixture-world.js";
import type {
  AdapterUnderTest,
  ExecFacade,
  ExecutionRequest,
  NodeExecutionAdapterOptions,
} from "./public-contract.js";

export interface ConstructedAdapter {
  adapter: AdapterUnderTest;
  constructorCalls: ReadonlyArray<{ name: string; args: unknown[] }>;
}

export interface ContractCaseContext {
  audit: BundleAudit;
  createAdapter(options?: NodeExecutionAdapterOptions): ConstructedAdapter;
  events(): {
    list: ExecutionEvent[];
    onEvent(event: ExecutionEvent): void;
  };
  facade: ExecFacade;
  track<T>(promise: Promise<T>): Promise<T>;
  world: FixtureWorld;
}

export interface ContractCaseOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export function argvRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    command: { args: ["alpha", "two words"], file: "fixture-tool", mode: "argv" },
    cwd: "/virtual/workspace",
    ...overrides,
  };
}

export function bashRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    command: { command: "printf fixture", mode: "shell", shellProfile: "posix-bash" },
    cwd: "/virtual/workspace",
    ...overrides,
  };
}

export function contractCase(
  name: string,
  options: ContractCaseOptions,
  body: (context: ContractCaseContext) => Promise<void>,
): void {
  test(name, { concurrency: false }, async () => {
    const world = new FixtureWorld(options);
    const uninstall = installFixtureWorld(world);
    const adapters: AdapterUnderTest[] = [];
    try {
      const { audit, facade } = await loadConfiguredExecFacade();
      const context: ContractCaseContext = {
        audit,
        createAdapter: (adapterOptions = {}) => {
          const adapter = new facade.NodeExecutionAdapter({
            outputRootDir: "/virtual/output",
            platform: world.process.platform,
            processEnv: world.process.env,
            ...adapterOptions,
          });
          adapters.push(adapter);
          const constructorCalls = world.retainedCalls.map((call) => ({
            args: [...call.args],
            name: call.name,
          }));
          return { adapter, constructorCalls };
        },
        events: () => {
          const list: ExecutionEvent[] = [];
          return { list, onEvent: (event: ExecutionEvent) => void list.push(event) };
        },
        facade,
        track: <T>(promise: Promise<T>) => world.track(promise),
        world,
      };
      await body(context);
    } finally {
      for (const spawn of world.spawns) {
        if (!spawn.child.finished) {
          spawn.child.finish(null, "SIGTERM");
        }
      }
      await Promise.allSettled(adapters.map(async (adapter) => adapter.close()));
      await world.drain();
      uninstall();
    }
  });
}

export async function completeSpawn(
  context: ContractCaseContext,
  options: { code?: number; stderr?: string; stdout?: string } = {},
): Promise<void> {
  const spawn = await context.world.waitForSpawn(context.world.spawns.length - 1);
  await spawn.child.emitSpawn();
  if (options.stdout !== undefined) {
    spawn.child.stdout.pushBytes(options.stdout);
  }
  if (options.stderr !== undefined) {
    spawn.child.stderr.pushBytes(options.stderr);
  }
  spawn.child.finish(options.code ?? 0);
}

export function assertTerminalEventOrder(
  events: readonly ExecutionEvent[],
  terminal: "completed" | "failed",
): void {
  assert.ok(events.length >= 2, "execution should emit started and a terminal event");
  assert.equal(events[0]?.type, "started");
  assert.equal(events.at(-1)?.type, terminal);
  assert.equal(events.filter((event) => event.type === terminal).length, 1);
}
