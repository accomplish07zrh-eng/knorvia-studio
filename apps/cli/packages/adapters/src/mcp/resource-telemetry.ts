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
  /* 拖住进程不退出（部分运行时可用） */ unref?(): void;
}

export interface McpResourceTimer {
  /* 撤销周期任务 */ clearInterval(/* 句柄 */ handle: TimerHandle): void;
  /* 注册周期任务 */ setInterval(
    /* 到点回调 */ callback: () => void,
    /* 周期毫秒 */ intervalMs: number,
  ): TimerHandle;
}

export interface McpResourceProcess {
  /* 进程树实例标识 */ instanceId: string;
  /* 所属 MCP 服务 */ mcpId: string;
  /* 主进程号 */ pid: number;
  /* 启动时刻（毫秒） */ startedAt: number;
  /* 是否仍属于当前代次 */ isCurrent(): boolean;
  /* 写回本轮观测 */ observed(
    /* 探针样本 */ samples: readonly ProcessProbeSample[] | undefined,
    /* 采样时刻 */ sampledAt: number,
    /* 探测范围 */ scope: ProcessTreeScope,
  ): void;
}

export interface McpResourceTelemetryOptions {
  /* 架构字段 */ arch: KnorviaMcpResourceSample["arch"];
  /* 平台字段 */ platform: KnorviaMcpResourceSample["platform"];
  /* 时钟 */ now(): number;
  /* 当前被观测的进程 */ getProcesses(): McpResourceProcess[];
  /* 采样批次回调 */ onResourceSamples?(samples: KnorviaMcpResourceSample[]): void;
  /* 可注入的进程探针 */ processProbe?: ProcessProbe;
  /* 可注入的逻辑核数 */ logicalCpuCount?: number;
  /* 可注入的总内存（GiB） */ totalMemoryGb?: number;
  /* 可注入的定时器 */ timer?: McpResourceTimer;
}

export function createMcpResourceTelemetry(options: McpResourceTelemetryOptions): {
  /* 立即采样一轮 */ sampleNow: () => Promise<void>;
  /* 启动周期采样 */ start(): void;
  /* 停止周期采样 */ stop(): void;
} {
  const treeProbe = options.processProbe ?? createProcessProbe({ platform: options.platform });
  const logicalCpuCount = options.logicalCpuCount ?? Math.max(1, cpus().length);
  const totalMemoryGb = options.totalMemoryGb ?? Math.round(totalmem() / BYTES_PER_GIB);
  const runToken = randomUUID();
  const scheduler: McpResourceTimer = options.timer ?? {
    clearInterval(intervalHandle) {
      clearInterval(intervalHandle as NodeJS.Timeout);
    },
    setInterval(toRun, periodMs) {
      return setInterval(toRun, periodMs);
    },
  };

  let cpuBaseline = new Map<string, Map<number, number>>();
  let priorSampleAt: number | undefined;
  let samplingActive = false;
  let epoch = 0;
  let activeTimer: TimerHandle | undefined;

  function resetWindow(): void {
    cpuBaseline = new Map();
    priorSampleAt = undefined;
  }

  function createGroup(
    /* 服务标识 */ serverId: string,
    /* 采样时刻 */ takenAt: number,
    /* 与上一轮的间隔 */ gapMs: number,
  ): KnorviaMcpResourceSample {
    /* 每个服务一组，先给零值再按树累计 */
    return {
      mcpId: serverId,
      instanceToken: runToken,
      sampledAt: takenAt,
      intervalMs: gapMs,
      processCount: /* 进程数，随后按树累计 */ 0,
      rssKbTotal: /* 常驻内存合计（KiB） */ 0,
      rssKbMaxProcess: /* 单进程最大常驻（KiB） */ 0,
      cpuTimeMsDelta: /* 两轮之间的 CPU 增量（毫秒） */ 0,
      uptimeMinutes: /* 最老进程的运行时长（分钟） */ 0,
      platform: /* 平台字段透传 */ options.platform,
      arch: /* 架构字段透传 */ options.arch,
      logicalCpuCount: /* 逻辑核数 */ logicalCpuCount,
      totalMemoryGb: /* 总内存（GiB） */ totalMemoryGb,
    };
  }

  async function sampleNow(): Promise<void> {
    if (samplingActive) return;
    const tracked = options.getProcesses();
    if (tracked.length === 0) {
      resetWindow();
      return;
    }
    samplingActive = true;
    const epochAtStart = epoch;
    // 保留既有边界：时钟失败发生在采样 try 之前，不顺带重置 samplingActive。
    const takenAt = options.now();
    try {
      treeProbe.reset();
      const treeById = await treeProbe.sampleProcessTrees(tracked.map((entry) => entry.pid));
      if (epoch !== epochAtStart) return;
      if (!treeById) {
        resetWindow();
        return;
      }
      const gapMs =
        priorSampleAt === undefined
          ? KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS
          : Math.max(1, takenAt - priorSampleAt);
      const freshCpu = new Map<string, Map<number, number>>();
      const groupByServer = new Map<string, KnorviaMcpResourceSample>();
      const countedPids = new Set<number>();

      for (const entry of tracked) {
        if (!entry.isCurrent()) continue;
        const pidTree = treeById.get(entry.pid);
        entry.observed(pidTree, takenAt, treeProbe.treeScope);
        if (!pidTree?.length) continue;

        const freshCounts = new Map<number, number>();
        const priorCpu = cpuBaseline.get(entry.instanceId);
        let bucket = groupByServer.get(entry.mcpId);
        for (const processSample of pidTree) {
          if (countedPids.has(processSample.pid)) continue;
          countedPids.add(processSample.pid);
          if (!bucket) {
            bucket = createGroup(entry.mcpId, takenAt, gapMs);
            groupByServer.set(entry.mcpId, bucket);
          }
          bucket.processCount += 1;
          bucket.rssKbTotal += processSample.rssKb;
          bucket.rssKbMaxProcess = Math.max(bucket.rssKbMaxProcess, processSample.rssKb);
          const elapsedCpu = processSample.cpuTimeMs;
          if (elapsedCpu !== undefined) {
            freshCounts.set(processSample.pid, elapsedCpu);
            const priorCpuTime = priorCpu?.get(processSample.pid);
            if (priorCpuTime !== undefined) {
              bucket.cpuTimeMsDelta += Math.max(0, elapsedCpu - priorCpuTime);
            }
          }
        }
        freshCpu.set(entry.instanceId, freshCounts);
        if (bucket) {
          bucket.uptimeMinutes = Math.max(
            bucket.uptimeMinutes,
            Math.floor(Math.max(0, takenAt - entry.startedAt) / MILLISECONDS_PER_MINUTE),
          );
        }
      }

      cpuBaseline = freshCpu;
      priorSampleAt = takenAt;
      if (groupByServer.size > 0) options.onResourceSamples?.([...groupByServer.values()]);
    } catch {
      resetWindow();
    } finally {
      samplingActive = false;
    }
  }

  function start(): void {
    if (activeTimer) return;
    try {
      activeTimer = scheduler.setInterval(() => {
        void sampleNow();
      }, KNORVIA_MCP_RESOURCE_SAMPLE_INTERVAL_MS);
      activeTimer.unref?.();
    } catch {
      // unref 失败时仍保留已取得的句柄，避免重复创建定时器。
    }
  }

  function stop(): void {
    epoch += 1;
    resetWindow();
    const pendingTimer = activeTimer;
    activeTimer = undefined;
    if (!pendingTimer) return;
    try {
      scheduler.clearInterval(pendingTimer);
    } catch {
      // 清理错误不恢复句柄；仍在等待的 probe 由其自身完成。
    }
  }

  return { sampleNow, start, stop };
}
