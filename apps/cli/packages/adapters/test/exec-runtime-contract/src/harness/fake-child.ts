// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { EventEmitter } from "node:events";
import { flushMicrotasks } from "./deferred.js";

export class FakeReadable extends EventEmitter {
  destroyed = false;
  paused = false;
  pauseCount = 0;
  resumeCount = 0;

  pause(): this {
    this.paused = true;
    this.pauseCount += 1;
    return this;
  }

  resume(): this {
    this.paused = false;
    this.resumeCount += 1;
    return this;
  }

  destroy(error?: Error): this {
    this.destroyed = true;
    if (error !== undefined) {
      this.emit("error", error);
    }
    this.emit("close");
    return this;
  }

  pushBytes(value: string | Uint8Array): void {
    const chunk = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
    this.emit("data", chunk);
  }

  finish(): void {
    this.emit("end");
    this.emit("close");
  }
}

export class FakeWritable extends EventEmitter {
  readonly chunks: Buffer[] = [];
  destroyed = false;
  ended = false;
  nextWriteError: Error | undefined;

  write(value: string | Uint8Array, callback?: (error?: Error | null) => void): boolean {
    const error = this.nextWriteError;
    this.nextWriteError = undefined;
    if (error === undefined) {
      this.chunks.push(Buffer.from(value));
    }
    queueMicrotask(() => callback?.(error ?? null));
    if (error !== undefined) {
      queueMicrotask(() => this.emit("error", error));
    }
    return error === undefined;
  }

  end(value?: string | Uint8Array, callback?: (error?: Error | null) => void): this {
    const error = this.nextWriteError;
    this.nextWriteError = undefined;
    if (value !== undefined && error === undefined) {
      this.chunks.push(Buffer.from(value));
    }
    this.ended = true;
    queueMicrotask(() => {
      callback?.(error ?? null);
      if (error !== undefined) {
        this.emit("error", error);
        this.emit("close");
      } else {
        this.emit("finish");
        this.emit("close");
      }
    });
    return this;
  }

  destroy(error?: Error): this {
    this.destroyed = true;
    if (error !== undefined) {
      this.emit("error", error);
    }
    this.emit("close");
    return this;
  }

  get text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export interface SpawnRecord {
  args: readonly string[];
  child: FakeChildProcess;
  file: string;
  options: Record<string, unknown>;
}

export class FakeChildProcess extends EventEmitter {
  readonly stderr = new FakeReadable();
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
  readonly stdio: readonly unknown[] = [this.stdin, this.stdout, this.stderr];
  connected = false;
  exitCode: number | null = null;
  finished = false;
  killed = false;
  pid: number | undefined;
  signalCode: NodeJS.Signals | null = null;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  async emitSpawn(): Promise<void> {
    this.emit("spawn");
    await flushMicrotasks(12);
  }

  failSpawn(error: Error): void {
    this.finished = true;
    this.emit("error", error);
    this.emit("close", null, null);
  }

  finish(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.stdout.finish();
    this.stderr.finish();
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.killSignals.push(signal);
    return true;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}
