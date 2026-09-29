// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { cpus, totalmem } from "node:os";
import {
  KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS,
  type KnorviaMcpResourceSample,
} from "@knorvia/shared";
import {
  createProcessProbe,
  type ProcessProbe,
  type ProcessProbeSample,
  type ProcessTreeScope,
} from "../device/process-probe.js";

const BYTES_PER_GIB = 1024 ** 3;
const MILLISECONDS_PER_MINUTE = 60_000;

interface TimerHandle {
  unref?(): void;
}

export interface McpResourceTimer {
  clearInterval(handle: TimerHandle): void;
  setInterval(callback: () => void, intervalMs: number): TimerHandle;
}

export interface McpResourceProcess {
  instanceId: string;
  mcpId: string;
  pid: number;
  startedAt: number;
  isCurrent(): boolean;
  observed(
    samples: readonly ProcessProbeSample[] | undefined,
    sampledAt: number,
    scope: ProcessTreeScope,
  ): void;
}

export interface McpResourceTelemetryOptions {
  arch: KnorviaMcpResourceSample["arch"];
  platform: KnorviaMcpResourceSample["platform"];
  now(): number;
  getProcesses(): McpResourceProcess[];
  onResourceSamples?(samples: KnorviaMcpResourceSample[]): void;
  processProbe?: ProcessProbe;
  logicalCpuCount?: number;
  totalMemoryGb?: number;
  timer?: McpResourceTimer;
}

export function createMcpResourceTelemetry(options: McpResourceTelemetryOptions): {
  sampleNow: () => Promise<void>;
  start(): void;
  stop(): void;
} {
  const probe = options.processProbe ?? createProcessProbe({ platform: options.platform });
  const logicalCpuCount = options.logicalCpuCount ?? Math.max(1, cpus().length);
  const totalMemoryGb = options.totalMemoryGb ?? Math.round(totalmem() / BYTES_PER_GIB);
  const instanceToken = randomUUID();
  const timer: McpResourceTimer = options.timer ?? {
    clearInterval(handle) {
      clearInterval(handle as NodeJS.Timeout);
    },
    setInterval(callback, intervalMs) {
      return setInterval(callback, intervalMs);
    },
  };

  let baseline = new Map<string, Map<number, number>>();
  let previousAt: number | undefined;
  let inFlight = false;
  let generation = 0;
  let handle: TimerHandle | undefined;

  function clearWindow(): void {
    baseline = new Map();
    previousAt = undefined;
  }

  function createGroup(
    mcpId: string,
    sampledAt: number,
    intervalMs: number,
  ): KnorviaMcpResourceSample {
    return {
      mcpId,
      instanceToken,
      sampledAt,
      intervalMs,
      processCount: 0,
      rssKbTotal: 0,
      rssKbMaxProcess: 0,
      cpuTimeMsDelta: 0,
      uptimeMinutes: 0,
      platform: options.platform,
      arch: options.arch,
      logicalCpuCount,
      totalMemoryGb,
    };
  }

  async function sampleNow(): Promise<void> {
    if (inFlight) return;
    const processes = options.getProcesses();
    if (processes.length === 0) {
      clearWindow();
      return;
    }
    inFlight = true;
    const sampleGeneration = generation;
    // 保留既有边界：时钟失败发生在采样 try 之前，不顺带重置 inFlight。
    const sampledAt = options.now();
    try {
      probe.reset();
      const trees = await probe.sampleProcessTrees(processes.map((entry) => entry.pid));
      if (generation !== sampleGeneration) return;
      if (!trees) {
        clearWindow();
        return;
      }
      const intervalMs =
        previousAt === undefined
          ? KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS
          : Math.max(1, sampledAt - previousAt);
      const nextBaseline = new Map<string, Map<number, number>>();
      const groups = new Map<string, KnorviaMcpResourceSample>();
      const seenPids = new Set<number>();

      for (const entry of processes) {
        if (!entry.isCurrent()) continue;
        const tree = trees.get(entry.pid);
        entry.observed(tree, sampledAt, probe.treeScope);
        if (!tree?.length) continue;

        const nextCpu = new Map<number, number>();
        const previousCpu = baseline.get(entry.instanceId);
        let group = groups.get(entry.mcpId);
        for (const processSample of tree) {
          if (seenPids.has(processSample.pid)) continue;
          seenPids.add(processSample.pid);
          if (!group) {
            group = createGroup(entry.mcpId, sampledAt, intervalMs);
            groups.set(entry.mcpId, group);
          }
          group.processCount += 1;
          group.rssKbTotal += processSample.rssKb;
          group.rssKbMaxProcess = Math.max(group.rssKbMaxProcess, processSample.rssKb);
          const cpuTime = processSample.cpuTimeMs;
          if (cpuTime !== undefined) {
            nextCpu.set(processSample.pid, cpuTime);
            const oldCpuTime = previousCpu?.get(processSample.pid);
            if (oldCpuTime !== undefined) {
              group.cpuTimeMsDelta += Math.max(0, cpuTime - oldCpuTime);
            }
          }
        }
        nextBaseline.set(entry.instanceId, nextCpu);
        if (group) {
          group.uptimeMinutes = Math.max(
            group.uptimeMinutes,
            Math.floor(Math.max(0, sampledAt - entry.startedAt) / MILLISECONDS_PER_MINUTE),
          );
        }
      }

      baseline = nextBaseline;
      previousAt = sampledAt;
      if (groups.size > 0) options.onResourceSamples?.([...groups.values()]);
    } catch {
      clearWindow();
    } finally {
      inFlight = false;
    }
  }

  function start(): void {
    if (handle) return;
    try {
      handle = timer.setInterval(() => {
        void sampleNow();
      }, KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS);
      handle.unref?.();
    } catch {
      // unref 失败时仍保留已取得的句柄，避免重复创建定时器。
    }
  }

  function stop(): void {
    generation += 1;
    clearWindow();
    const scheduled = handle;
    handle = undefined;
    if (!scheduled) return;
    try {
      timer.clearInterval(scheduled);
    } catch {
      // 清理错误不恢复句柄；仍在等待的 probe 由其自身完成。
    }
  }

  return { sampleNow, start, stop };
}
