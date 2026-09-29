// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BackgroundExecutionSnapshot,
  BackgroundExecutionStartResult,
  ExecutionPort,
  ExecutionRequest,
  ExecutionResult,
  ExecutionRunOptions,
  ExecutionShellSelection,
} from "@knorvia/contracts";
import type { BackgroundBashOutputResult } from "@knorvia/shared";

export interface NodeExecutionAdapterOptions {
  onToolExecResource?: (sample: Record<string, unknown>) => void;
  outputRootDir?: string;
  maxPersistedOutputBytes?: number;
  network?: { caCertFile?: string; httpProxy?: string; noProxy?: string };
  platform?: NodeJS.Platform;
  processEnv?: NodeJS.ProcessEnv;
  progressIntervalMs?: number;
  progressTailBytes?: number;
  progressThresholdMs?: number;
}

export interface AdapterUnderTest extends ExecutionPort {
  close(): Promise<void>;
  start(
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ): Promise<BackgroundExecutionStartResult>;
  getBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  waitForBackgroundTask(
    taskId: string,
    options?: { signal?: AbortSignal },
  ): Promise<BackgroundExecutionSnapshot | undefined>;
  cancelBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined>;
  readBackgroundBashOutput(taskId: string, sessionId: string): Promise<BackgroundBashOutputResult>;
  runBashWithBackgroundLifecycle(
    request: ExecutionRequest,
    lifecycle: { mode: "explicit" | "auto_on_timeout" },
    options?: ExecutionRunOptions,
  ): Promise<
    | { kind: "foreground"; result: ExecutionResult }
    | { kind: "backgrounded"; task: BackgroundExecutionStartResult }
  >;
}

export interface ResolvedSpawnCommand {
  args: string[];
  cwdDialect: "cmd" | "posix" | "git-bash";
  envOverlay?: Record<string, string>;
  file: string;
  shell: boolean | string;
  usesLoginShell?: boolean;
}

export interface ExecFacade {
  NodeExecutionAdapter: new (options?: NodeExecutionAdapterOptions) => AdapterUnderTest;
  createNodeExecutionAdapter(options?: NodeExecutionAdapterOptions): ExecutionPort;
  resolveEffectiveBashShellSelection(options: {
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform | string;
    exists?: (path: string) => boolean;
    override?: ExecutionShellSelection;
  }): {
    selection: ExecutionShellSelection;
    provider?: { dialect: string; file: string; shell: boolean | string };
  };
  buildExecutionEnv(
    overlay?: { base?: "inherit" | "empty"; set?: Record<string, string>; unset?: string[] },
    options?: {
      network?: { caCertFile?: string; httpProxy?: string; noProxy?: string };
      platform?: NodeJS.Platform;
      processEnv?: NodeJS.ProcessEnv;
    },
  ): NodeJS.ProcessEnv;
  resolveExecutionCommand(
    command: ExecutionRequest["command"],
    options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      exists?: (path: string) => boolean;
      platform?: NodeJS.Platform;
      resolvedShell?: ResolvedSpawnCommand;
    },
  ): ResolvedSpawnCommand;
  setResolvedShellLoginMode(
    resolved: ResolvedSpawnCommand,
    useLoginShell: boolean,
  ): ResolvedSpawnCommand;
  applyResolvedShellCommandForTest(
    resolved: ResolvedSpawnCommand,
    command: string,
  ): ResolvedSpawnCommand;
  decodeExecutionOutputBuffer(buffer: Buffer, legacyOutputEncoding?: string | null): string;
}

export type { ExecutionRequest, ExecutionResult, ExecutionRunOptions };
