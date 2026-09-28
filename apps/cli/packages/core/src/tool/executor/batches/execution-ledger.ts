// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ToolSchedule } from "../../scheduler.js";
import type { ExecutableToolCall, ToolExecutionResult } from "../../types.js";

/** A completed wave is the only operation that releases the next input interval. */
export class WaveLedger {
  readonly results: ToolExecutionResult[] = [];
  private offset = 0;

  constructor(
    private readonly input: ExecutableToolCall[],
    private readonly width: number,
  ) {}

  select(): ExecutableToolCall[] | undefined {
    if (!(this.offset < this.input.length)) return undefined;
    return this.input.slice(this.offset, this.offset + this.width);
  }

  complete(outcomes: ToolExecutionResult[]): void {
    this.results.push(...outcomes);
    this.offset += this.width;
  }
}

interface GroupReceipt {
  index: number;
  ids: string[];
  calls: ExecutableToolCall[];
}

/** Per-consumption cursor; the caller still owns and may update future plan groups. */
export class ScheduleLedger {
  readonly results: ToolExecutionResult[] = [];
  private readonly byId: Map<string, ExecutableToolCall>;
  private position = -1;

  constructor(
    input: ExecutableToolCall[],
    private readonly plan: ToolSchedule,
  ) {
    this.byId = new Map(input.map((call) => [call.id, call]));
  }

  select(): GroupReceipt | undefined {
    while (++this.position < this.plan.parallelGroups.length) {
      const ids = this.plan.parallelGroups[this.position];
      const calls = this.resolve(ids);
      if (calls.length) return { index: this.position, ids, calls };
    }
    return undefined;
  }

  record(outcomes: ToolExecutionResult[]): void {
    this.results.push(...outcomes);
  }

  remainder(): ExecutableToolCall[] {
    return this.resolve(this.plan.parallelGroups.slice(this.position + 1).flat());
  }

  private resolve(ids: string[]): ExecutableToolCall[] {
    return ids
      .map((id) => this.byId.get(id))
      .filter((call): call is ExecutableToolCall => call !== undefined);
  }
}
