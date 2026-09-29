// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { deferred, type Deferred } from "./deferred.js";

export type ScriptedOutcome<T> =
  | { kind: "return"; value: T }
  | { kind: "throw"; error: unknown }
  | { kind: "pending"; deferred: Deferred<T> };

export class Scripted<T> {
  readonly calls: unknown[][] = [];
  readonly outcomes: ScriptedOutcome<T>[] = [];

  enqueueReturn(value: T): void {
    this.outcomes.push({ kind: "return", value });
  }

  enqueueThrow(error: unknown): void {
    this.outcomes.push({ kind: "throw", error });
  }

  enqueuePending(): Deferred<T> {
    const handle = deferred<T>();
    this.outcomes.push({ kind: "pending", deferred: handle });
    return handle;
  }

  async invoke(...args: unknown[]): Promise<T> {
    this.calls.push(args);
    const outcome = this.outcomes.shift();
    if (outcome === undefined) {
      throw new Error("No scripted outcome remains");
    }
    if (outcome.kind === "throw") {
      throw outcome.error;
    }
    if (outcome.kind === "pending") {
      return outcome.deferred.promise;
    }
    return outcome.value;
  }
}
