// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { KnorviaToolExecResource } from "@knorvia/shared";
import type { NetworkEgressEnvPolicy } from "../network/subprocess-env.js";
import type { ResolvedSpawnCommand } from "./execution-command.js";
import type {
  BackgroundExecutionSnapshot,
  BackgroundExecutionStartResult,
  ExecutionRequest,
  ExecutionResult,
  ExecutionRunOptions,
  ExecutionShellDialect,
} from "@knorvia/contracts";

export interface /* 退出状态 */ ExitState {
  code?: number;
  signal?: string;
  error?: Error;
}

export interface BackgroundTaskRecord extends BackgroundExecutionSnapshot {
  sessionId?: string;
  isBash: /* 是否 bash 方言 */ boolean;
  legacyOutputEncoding: /* 遗留输出编码（无则 null） */ string | null;
  completion: Promise<BackgroundExecutionSnapshot>;
  controller: /* 取消控制器 */ AbortController;
  externalAbort?: /* 外部中止回调 */ () => void;
  resolveCompletion: (snapshot: BackgroundExecutionSnapshot) => void;
}

export interface /* 输出落盘路径集合 */ ExecutionOutputPaths {
  outputPath?: /* 主输出路径 */ string;
  stderrPersistedOutputPath?: /* stderr 落盘路径 */ string;
  stdoutPersistedOutputPath?: /* stdout 落盘路径 */ string;
}

export interface InternalExecutionRunOptions extends ExecutionRunOptions {
  onOutputEncodingResolved?: (encoding: string | null) => void;
  bashLifecycle?: /* bash 生命周期钩子 */ {
    isBackgrounded: /* 是否已转后台 */ () => boolean;
    onBackgrounded?: /* 转后台回调 */ () => void;
    onExit?: /* 退出回调 */ () => void;
  };
  onPersistedLimit?: /* 达到落盘上限回调 */ () => void;
  sharePersistedOutputLimitAcrossStreams?: /* 各流共享落盘额度 */ boolean;
  shouldStopOnPersistedLimit?: /* 超限是否停止 */ () => boolean;
  shouldRetainExecutionAfterRootExit?: /* 根进程退出后是否保留 */ () => boolean;
  suppressTerminalEvent?: boolean;
}

export type /* 后台生命周期模式 */ BashBackgroundLifecycleMode = "explicit" | "auto_on_timeout";
export type /* 后台生命周期结果 */ BashBackgroundLifecycleResult =
  | { kind: "foreground"; result: ExecutionResult }
  | { kind: "backgrounded"; task: BackgroundExecutionStartResult };

export interface /* 预备好的子进程 spawn */ PreparedChildSpawn {
  command: ResolvedSpawnCommand;
  cwdDialect: /* cwd 方言 */ ExecutionShellDialect;
  cwdFilePath?: /* cwd 结果文件 */ string;
  spawnOptions: /* 透传给 spawn 的选项 */ SpawnOptions;
}

export interface PreparedExecution extends PreparedChildSpawn {
  isBash: /* 是否 bash 方言 */ boolean;
  legacyOutputEncoding: /* 遗留输出编码（无则 null） */ string | null;
  request: ExecutionRequest;
}

export interface ActiveExecutionRecord {
  completion: Promise<void>;
  resolveCompletion: () => void;
  stop: (reason: StopReason) => void;
}

export interface NodeExecutionAdapterOptions {
  onToolExecResource?: (sample: KnorviaToolExecResource) => void;
  outputRootDir?: string;
  maxPersistedOutputBytes?: number;
  network?: NetworkEgressEnvPolicy;
  platform?: NodeJS.Platform;
  processEnv?: NodeJS.ProcessEnv;
  progressIntervalMs?: number;
  progressTailBytes?: number;
  progressThresholdMs?: number;
}

export type OutputPersistenceMode = "none" | "on_truncate" | "always";
export type StopReason = "timeout" | "cancelled" | "output_limit";

export interface RunControl {
  child?: ChildProcess;
  stop: (reason: StopReason) => void;
}
