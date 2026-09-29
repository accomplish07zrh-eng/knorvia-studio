// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import { FakeChildProcess, type SpawnRecord } from "./fake-child.js";
import { FakeClock } from "./fake-clock.js";
import { FakeFileSystem } from "./fake-fs.js";
import { deferred, flushMicrotasks, type Deferred } from "./deferred.js";
import { Scripted } from "./scripted.js";

export const FIXTURE_WORLD_KEY = Symbol.for("knorvia.exec.contract.fixture-world");

export interface ExecFileResult {
  stderr: string;
  stdout: string;
}

export interface ExecFileCall {
  args: readonly string[];
  file: string;
  options: ExecFileOptionsWithStringEncoding;
  deferred: Deferred<ExecFileResult>;
}

export interface ProcessSample {
  cpuTimeMs?: number;
  pid: number;
  rssKb: number;
}

interface SignalRecord {
  pid: number;
  signal: NodeJS.Signals | number | undefined;
}

interface ProcessState {
  arch: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  execPath: string;
  memoryUsage: () => NodeJS.MemoryUsage;
  pid: number;
  platform: NodeJS.Platform;
}

export class FixtureWorld {
  readonly clock = new FakeClock();
  readonly execFileCalls: ExecFileCall[] = [];
  readonly fileSystem = new FakeFileSystem();
  readonly processProbe = {
    calls: [] as number[],
    reset: (): void => undefined,
    sampleProcessGroup: async (
      processGroupId: number,
    ): Promise<readonly ProcessSample[] | undefined> => {
      this.processProbe.calls.push(processGroupId);
      if (this.probeSamples.outcomes.length === 0) {
        return undefined;
      }
      return this.probeSamples.invoke(processGroupId);
    },
    sampleProcessTrees: async (): Promise<
      ReadonlyMap<number, readonly ProcessSample[]> | undefined
    > => undefined,
    treeScope: "process_tree" as const,
  };
  readonly probeSamples = new Scripted<readonly ProcessSample[] | undefined>();
  readonly retainedCalls: Array<{ name: string; args: unknown[] }> = [];
  readonly signals: SignalRecord[] = [];
  readonly spawns: SpawnRecord[] = [];
  readonly trackedPromises = new Set<Promise<unknown>>();
  readonly process: ProcessState;
  execFileDefault: ExecFileResult | Error = new Error("fixture execFile has no scripted result");
  execFileSyncResult = "65001\n";
  freeMemoryBytes = 8 * 1_024 * 1_024;
  legacyDecodedText = "fixture-legacy-decoded";
  nextPid = 4_100;
  nextStdinError: Error | undefined;
  randomCounter = 0;
  spawnError: Error | undefined;
  usePendingExecFile = false;

  constructor(options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}) {
    this.process = {
      arch: "x64",
      cwd: "/virtual/workspace",
      env: { ...options.env },
      execPath: "/virtual/node",
      memoryUsage: () => ({
        arrayBuffers: 1_024,
        external: 2_048,
        heapTotal: 8_192,
        heapUsed: 4_096,
        rss: 64 * 1_024,
      }),
      pid: 700,
      platform: options.platform ?? "linux",
    };
    this.fileSystem.mkdirSync(this.process.cwd);
  }

  spawn(
    file: string,
    args: readonly string[] = [],
    options: Record<string, unknown> = {},
  ): FakeChildProcess {
    if (this.spawnError !== undefined) {
      const error = this.spawnError;
      this.spawnError = undefined;
      throw error;
    }
    const child = new FakeChildProcess(this.nextPid);
    this.nextPid += 1;
    child.stdin.nextWriteError = this.nextStdinError;
    this.nextStdinError = undefined;
    this.spawns.push({ args: [...args], child, file, options: { ...options } });
    return child;
  }

  execFile(
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): FakeChildProcess {
    const result = deferred<ExecFileResult>();
    const call: ExecFileCall = { args: [...args], deferred: result, file, options };
    this.execFileCalls.push(call);
    result.promise.then(
      (value) => {
        this.applyOwnedExecFileSideEffects(args, value);
        callback(null, value.stdout, value.stderr);
      },
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), "", ""),
    );
    const defaultResult = this.execFileDefault;
    if (defaultResult instanceof Error) {
      queueMicrotask(() => result.reject(defaultResult));
    } else {
      queueMicrotask(() => result.resolve(defaultResult));
    }
    return new FakeChildProcess(this.nextPid++);
  }

  execFilePending(
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): FakeChildProcess {
    const result = deferred<ExecFileResult>();
    this.execFileCalls.push({ args: [...args], deferred: result, file, options });
    result.promise.then(
      (value) => {
        this.applyOwnedExecFileSideEffects(args, value);
        callback(null, value.stdout, value.stderr);
      },
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), "", ""),
    );
    return new FakeChildProcess(this.nextPid++);
  }

  signal(pid: number, signal?: NodeJS.Signals | number): boolean {
    this.signals.push({ pid, signal });
    return true;
  }

  randomUUID(): string {
    this.randomCounter += 1;
    return `00000000-0000-4000-8000-${String(this.randomCounter).padStart(12, "0")}`;
  }

  decodeLegacy(buffer: Uint8Array, _encoding: string): string {
    return buffer.length === 0 ? "" : this.legacyDecodedText;
  }

  track<T>(promise: Promise<T>): Promise<T> {
    this.trackedPromises.add(promise);
    void promise.then(
      () => this.trackedPromises.delete(promise),
      () => this.trackedPromises.delete(promise),
    );
    return promise;
  }

  async waitForSpawn(index = 0): Promise<SpawnRecord> {
    for (let turn = 0; turn < 30; turn += 1) {
      const record = this.spawns[index];
      if (record !== undefined) {
        return record;
      }
      await flushMicrotasks();
    }
    throw new Error(`spawn ${index} was not observed`);
  }

  async waitForExecFile(index = 0): Promise<ExecFileCall> {
    for (let turn = 0; turn < 30; turn += 1) {
      const call = this.execFileCalls[index];
      if (call !== undefined) {
        return call;
      }
      await flushMicrotasks();
    }
    throw new Error(`execFile ${index} was not observed`);
  }

  async drain(): Promise<void> {
    this.fileSystem.releaseAllDrains();
    await this.clock.drainCurrent();
    await flushMicrotasks(12);
    assert.equal(
      this.trackedPromises.size,
      0,
      "every case must settle tracked promises before fixture removal",
    );
    assert.deepEqual(this.clock.callbackErrors, [], "fixture timer callbacks must not throw");
  }

  private applyOwnedExecFileSideEffects(args: readonly string[], result: ExecFileResult): void {
    const command = args.join("\n");
    const snapshotPath = /(?:^|\n)SNAPSHOT_FILE='([^']+)'/u.exec(command)?.[1];
    if (snapshotPath === undefined) {
      return;
    }
    this.fileSystem.writeFileSync(snapshotPath, result.stdout);
    this.retainedCalls.push({ args: [snapshotPath], name: "ownedShellSnapshotWrite" });
  }
}

declare global {
  var __knorviaExecFixtureWorld: FixtureWorld | undefined;
}

export function installFixtureWorld(world: FixtureWorld): () => void {
  const fixtureGlobal = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  assert.equal(fixtureGlobal[FIXTURE_WORLD_KEY], undefined, "fixture worlds cannot overlap");
  fixtureGlobal[FIXTURE_WORLD_KEY] = world;
  globalThis.__knorviaExecFixtureWorld = world;
  return () => {
    assert.equal(
      fixtureGlobal[FIXTURE_WORLD_KEY],
      world,
      "only the owning case may remove its fixture",
    );
    delete fixtureGlobal[FIXTURE_WORLD_KEY];
    globalThis.__knorviaExecFixtureWorld = undefined;
  };
}

export function currentFixtureWorld(): FixtureWorld {
  const fixtureGlobal = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
  const world = fixtureGlobal[FIXTURE_WORLD_KEY];
  if (!(world instanceof FixtureWorld)) {
    throw new Error("No execution fixture world is installed");
  }
  return world;
}
