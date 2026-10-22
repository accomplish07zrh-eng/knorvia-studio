// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// Hook 执行：把配置的 Hook 变成一次子进程调用（B7 的 6 条规格）。
//
// 依据：`specs/contracts/core-hooks/behavior.md` B7。
//
// 关键约束（B7.4）：
//   **无论成功、失败、取消，都必须在 `finally` 里调用 stdin 的 `cleanup()`。**
//   临时目录泄漏是最常见的 Hook 实现缺陷，所以这里用 `try/finally` 强制清理。
import type { ExecutionPort } from "@knorvia/contracts";
import type { HookTempDirectoryPort } from "./temp-directory.js";
import type { HookInputLike } from "./hook-input.js";
import { buildHookStdin } from "./hook-input.js";
import {
  createHookEnvOverlay,
  expandHookVariables,
  type HookPluginContextLike,
} from "./hook-env.js";

/** Hook 的两种形态（B7.1）。 */
export type HookCommandConfig =
  | {
      readonly type: "command";
      /** 经 shell 执行的命令行文本。 */
      readonly command: string;
      /** 是否异步（本模块同步等待；异步由上层调度）。 */
      readonly async?: boolean;
      /** 指定 shell；省略时由执行端口选默认。 */
      readonly shell?: true | string;
    }
  | {
      readonly type: "process";
      /** 可执行文件路径。 */
      readonly command: string;
      readonly args?: readonly string[];
    };

/** 一次 Hook 执行的入参。 */
export interface HookExecutionRequest {
  readonly hook: HookCommandConfig;
  readonly input: HookInputLike;
  readonly plugin?: HookPluginContextLike;
  readonly workingDirectory: string;
  /** 该条 Hook 的有效超时（毫秒）。 */
  readonly timeoutMs: number;
  /** 输出上限（字节）。 */
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

/** 执行结果：stdout/stderr/退出码，由解析层（B8）消费。 */
export interface HookExecutionOutcome {
  /** 执行端口的原始终态（5 值，B8 会按它分支）。 */
  readonly status: "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error";
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}

/**
 * 执行一次 Hook。
 *
 * 流程：
 *   ① 构造 stdin（B1）—— 这一步会创建临时目录
 *   ② 展开命令/参数里的变量（B2）—— **展开失败要向上抛**（B7.3）
 *   ③ 按 type 选 argv / shell 形态（B7.1）
 *   ④ `finally` 里 cleanup（B7.4）
 */
export async function runHook(
  request: HookExecutionRequest,
  execution: ExecutionPort,
  tempDirectory: HookTempDirectoryPort,
): Promise<HookExecutionOutcome> {
  const stdin = await buildHookStdin(request.input, tempDirectory);
  try {
    // 变量展开在 try 内：展开抛错时也要走 finally 清理临时目录。
    const command = expandHookVariables(
      request.hook.command,
      request.plugin,
      request.input,
      request.workingDirectory,
    );

    const executionCommand =
      request.hook.type === "process"
        ? {
            mode: "argv" as const,
            file: command,
            args: (request.hook.args ?? []).map((arg) =>
              expandHookVariables(arg, request.plugin, request.input, request.workingDirectory),
            ),
          }
        : {
            mode: "shell" as const,
            command,
            // `shell: true` 在旧配置里表示「用系统默认 shell」→ 传给端口时省略具体值。
            ...(request.hook.shell === true || request.hook.shell === undefined
              ? {}
              : { shell: request.hook.shell }),
          };

    const env = createHookEnvOverlay(request.plugin, request.input, request.workingDirectory);

    const result = await execution.run(
      {
        command: executionCommand,
        cwd: request.input.cwd || request.workingDirectory,
        env: env.set,
        stdin: stdin.value,
        timeoutMs: request.timeoutMs,
        outputLimit: {
          maxBufferBytes: request.maxOutputBytes,
          maxInlineBytes: request.maxOutputBytes,
          persistOutput: "none",
        },
      },
      request.signal === undefined ? undefined : { signal: request.signal },
    );

    return {
      status: result.status,
      exitCode: result.exitCode,
      // `stdout` / `stderr` 在端口里是 `{ text, bytes, truncated }`，这里取文本。
      stdout: result.stdout.text,
      stderr: result.stderr.text,
      timedOut: result.timedOut,
      cancelled: result.cancelled,
    };
  } finally {
    // B7.4：无论成功、失败、取消，都必须清理临时目录。
    await stdin.cleanup();
  }
}
