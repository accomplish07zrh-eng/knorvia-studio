// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ModelToolSideEffectScope, ToolCallId } from "@knorvia/contracts";
import { describeDependency } from "./scheduler/capability-policy.js";
import { DependencyPlan } from "./scheduler/dependency-plan.js";
import { parallelLayers } from "./scheduler/parallel-layers.js";

export interface ToolSchedule {
  items: ToolScheduleItem[];
  parallelGroups: ToolCallId[][];
  executionOrder: ToolCallId[];
}
export interface ToolScheduleItem {
  toolCallId: ToolCallId;
  toolName?: string;
  dependencies: ToolCallId[];
  canRunParallel: boolean;
  readOnly?: boolean;
  destructive?: boolean;
  concurrentSafe?: boolean;
  sideEffectScope?: ModelToolSideEffectScope;
}
export interface ToolDependency {
  toolCallId: ToolCallId;
  toolName?: string;
  dependsOn: ToolCallId[];
  readOnly?: boolean;
  destructive?: boolean;
  concurrentSafe?: boolean;
  sideEffectScope?: ModelToolSideEffectScope;
}
interface ToolSchedulerOptions {
  maxConcurrency?: number;
  readOnlyTools?: Set<string>;
}
const DEFAULT_CONCURRENCY = 10;

export class ToolScheduler {
  private readonly width: number;
  private readonly knownReaders: Set<string>;

  constructor(options: ToolSchedulerOptions = {}) {
    this.width = options.maxConcurrency ?? DEFAULT_CONCURRENCY;
    this.knownReaders = options.readOnlyTools ?? READ_ONLY_TOOLS;
  }

  schedule(tools: ToolDependency[]): ToolSchedule {
    const items = tools.map((tool) => describeDependency(tool, this.knownReaders));
    const plan = new DependencyPlan(items);
    const parallelGroups = parallelLayers(plan.ordered(), this.width);
    plan.verify(parallelGroups);
    return { items, parallelGroups, executionOrder: parallelGroups.flat() };
  }
}

export const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "TodoRead",
  "TodoWrite",
  "AskUserQuestion",
  "Skill",
]);
export const defaultToolScheduler = new ToolScheduler();
