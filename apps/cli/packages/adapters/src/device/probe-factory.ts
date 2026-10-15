// SPDX-License-Identifier: Apache-2.0
// 进程探测实现：实例持有失败预算与平台策略；每次采样自带绝对截止。
import { readdir, readFile } from "node:fs/promises";
import { readDarwinProcessGroup, readDarwinProcessTable } from "./process-probe-darwin.js";
import {
  sampleLinuxProcessGroup,
  sampleLinuxProcessTrees,
  type LinuxProcReaders,
} from "./process-probe-linux.js";
import { readWindowsProcessMemory } from "./process-probe-windows.js";
import type { CreateProcessProbeOptions, ProcessProbe, ProcessTreeScope } from "./probe-types.js";
import {
  defaultProbeExecFile,
  groupProcessTrees,
  isSamplablePid,
  PROCESS_PROBE_SAMPLE_TIMEOUT_MS,
  ProcessProbeFailure,
  toSample,
  type ProcessProbeExecFile,
  type ProcessProbeSample,
} from "./process-probe-shared.js";

const FAILURE_BUDGET = 3;
const PROC_ROOT = "/proc";

/** 与一次绝对截止赛跑：超时抛 ProcessProbeFailure，结束后清掉定时器。 */
async function withDeadline<T>(operation: (isExpired: () => boolean) => Promise<T>): Promise<T> {
  const expiresAt = Date.now() + PROCESS_PROBE_SAMPLE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let passed = false;
  const expiry = new Promise<never>((_resolve, fail) => {
    timer = setTimeout(() => {
      passed = true;
      fail(new ProcessProbeFailure(`采样超过 ${PROCESS_PROBE_SAMPLE_TIMEOUT_MS} 毫秒`));
    }, PROCESS_PROBE_SAMPLE_TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    // 事件循环被阻塞时 timer 可能还没跑；批次仍按本次绝对截止停止后续 I/O。
    const value = await Promise.race([operation(() => passed || Date.now() >= expiresAt), expiry]);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/** 保留输入顺序、去掉非法与重复 PID。 */
function samplablePids(rootPids: readonly number[]): number[] {
  const kept: number[] = [];
  const seen = new Set<number>();
  for (const pid of rootPids) {
    if (!isSamplablePid(pid) || seen.has(pid)) continue;
    seen.add(pid);
    kept.push(pid);
  }
  return kept;
}

class ProcessProbeInstance implements ProcessProbe {
  private softFailures = 0;
  private readonly executor: ProcessProbeExecFile;
  private readonly platform: NodeJS.Platform;
  private readonly notifyFailed: ((reason: string) => void) | undefined;
  private readonly listProc: () => Promise<readonly string[]>;
  private readonly readProc: (path: string) => Promise<string>;

  constructor(options: CreateProcessProbeOptions) {
    this.platform = options.platform ?? process.platform;
    this.executor = options.execFile ?? defaultProbeExecFile;
    this.notifyFailed = options.onSampleFailed;
    this.listProc = options.listProcDirectory ?? (() => readdir(PROC_ROOT));
    this.readProc = options.readProcFile ?? ((path) => readFile(path, "utf8"));
  }

  get treeScope(): ProcessTreeScope {
    return this.platform === "win32" ? "direct_process" : "process_tree";
  }

  reset(): void {
    this.softFailures = 0;
  }

  private procReaders(isExpired: () => boolean): LinuxProcReaders {
    const readers = {
      listProcDirectory: this.listProc,
      readProcFile: this.readProc,
    } as LinuxProcReaders;
    readers.isExpired = isExpired;
    return readers;
  }

  /** 预算用尽直接放弃；失败只记一次并降级成 undefined，成功则清零。 */
  private async guarded<T>(
    operation: (isExpired: () => boolean) => Promise<T>,
  ): Promise<T | undefined> {
    if (this.softFailures >= FAILURE_BUDGET) return undefined;
    try {
      const value = await withDeadline(operation);
      this.softFailures = 0;
      return value;
    } catch (error) {
      this.softFailures += 1;
      try {
        this.notifyFailed?.(error instanceof Error ? error.message : String(error));
      } catch {
        /* 诊断观察者不能影响执行与失败预算。 */
      }
      return undefined;
    }
  }

  private sampleLinuxTrees(isExpired: () => boolean, requested: readonly number[]) {
    return sampleLinuxProcessTrees(this.procReaders(isExpired), requested);
  }

  private async sampleWindowsTrees(requested: readonly number[]) {
    const rows = await readWindowsProcessMemory(this.executor, requested);
    return new Map(rows.map((row) => [row.pid, [row]]));
  }

  private async sampleDarwinTrees(requested: readonly number[]) {
    const rows = await readDarwinProcessTable(this.executor);
    return groupProcessTrees(rows, requested);
  }

  async sampleProcessTrees(rootPids: readonly number[]) {
    const requested = samplablePids(rootPids);
    if (requested.length === 0) return new Map();
    return await this.guarded(async (isExpired) => {
      if (this.platform === "linux") return this.sampleLinuxTrees(isExpired, requested);
      if (this.platform === "win32") return await this.sampleWindowsTrees(requested);
      return await this.sampleDarwinTrees(requested);
    });
  }

  async sampleProcessGroup(processGroupId: number) {
    if (this.platform === "win32" || !isSamplablePid(processGroupId)) return undefined;
    return await this.guarded(async (isExpired) => {
      if (this.platform !== "linux") {
        const rows = await readDarwinProcessGroup(this.executor, processGroupId);
        return rows.map(toSample);
      }
      return await sampleLinuxProcessGroup(this.procReaders(isExpired), processGroupId);
    });
  }
}

export function createProcessProbe(options: CreateProcessProbeOptions = {}): ProcessProbe {
  return new ProcessProbeInstance(options);
}
