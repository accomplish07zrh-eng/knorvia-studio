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

export interface ExitState {
  code?: number;
  signal?: string;
  error?: Error;
}

export interface BackgroundTaskRecord extends BackgroundExecutionSnapshot {
  sessionId?: string;
  isBash: boolean;
  legacyOutputEncoding: string | null;
  completion: Promise<BackgroundExecutionSnapshot>;
  controller: AbortController;
  externalAbort?: () => void;
  resolveCompletion: (snapshot: BackgroundExecutionSnapshot) => void;
}

export interface ExecutionOutputPaths {
  outputPath?: string;
  stderrPersistedOutputPath?: string;
  stdoutPersistedOutputPath?: string;
}

export interface InternalExecutionRunOptions extends ExecutionRunOptions {
  onOutputEncodingResolved?: (encoding: string | null) => void;
  bashLifecycle?: {
    isBackgrounded: () => boolean;
    onBackgrounded?: () => void;
    onExit?: () => void;
  };
  onPersistedLimit?: () => void;
  sharePersistedOutputLimitAcrossStreams?: boolean;
  shouldStopOnPersistedLimit?: () => boolean;
  shouldRetainExecutionAfterRootExit?: () => boolean;
  suppressTerminalEvent?: boolean;
}

export type BashBackgroundLifecycleMode = "explicit" | "auto_on_timeout";
export type BashBackgroundLifecycleResult =
  | { kind: "foreground"; result: ExecutionResult }
  | { kind: "backgrounded"; task: BackgroundExecutionStartResult };

export interface PreparedChildSpawn {
  command: ResolvedSpawnCommand;
  cwdDialect: ExecutionShellDialect;
  cwdFilePath?: string;
  spawnOptions: SpawnOptions;
}

export interface PreparedExecution extends PreparedChildSpawn {
  isBash: boolean;
  legacyOutputEncoding: string | null;
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
