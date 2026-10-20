// SPDX-License-Identifier: Apache-2.0
// 沙箱启动。三件互相依赖的事：定执行体、把 payload 落成入口文件、spawn 子进程。
//
// 三者放在一起是因为它们共享同一条约束：payload 不能走命令行（Windows 限 32,767 字符）。
// 于是执行体先降级成函数体，连同 args 与堆上限渲染成一份自包含 ESM 写到磁盘，spawn 时
// 命令行里只剩一条路径。
import { spawn, type ChildProcess } from "node:child_process";
import {
  lowerWorkflowScript,
  WorkflowError,
  type RunSettlement,
  type WorkflowEngine,
} from "@knorvia/dynamic-workflow";
import { renderChildEntry } from "./child-source.js";
import { writeChildEntryFile } from "./child-entry-file.js";
import type { ChildPayload } from "./protocol.js";
import type { RunWorkflowOptions } from "./harness-options.js";

/** 缺省堆上限（MB）：与 SEA 限制一起构成 payload 的一半。 */
export const DEFAULT_MAX_OLD_SPACE_MB = 256;

/** 启动结果：拿到子进程，或者已经结算完（启动失败经引擎归一）。 */
export type LaunchOutcome = { process: ChildProcess } | { settled: Promise<RunSettlement> };

/** 启动所需的全部输入。 */
export interface SandboxLaunchInput {
  /** run 的裁决者：启动失败时由它给出结算。 */
  judge: WorkflowEngine;
  /** 子进程的工作目录，也是入口文件的落点。 */
  workDir: string;
  /** run 标识，决定入口文件名与头注释。 */
  runLabel: string;
  /** 堆上限（MB），映射成 Node 旗标或交给入口文件。 */
  heapMb: number;
  /** 已定下来的执行体（lowered async 函数体）。 */
  body: string;
  /** 调用方给的 run 选项：实参、取消信号、spawn 策略与告警口都在里面。 */
  options: RunWorkflowOptions;
}

/** spawn 通道：stdin/stdout/stderr 都要，前两者承载 NDJSON。 */
const SANDBOX_STDIO: ["pipe", "pipe", "pipe"] = ["pipe", "pipe", "pipe"];

/**
 * 定执行体。`lowered` 优先；否则现场 lower 脚本原文。脏脚本在启动子进程之前就抛错——
 * 降级运行会把「脚本本身写错了」伪装成一次普通的 run 失败。
 */
export function resolveLowered(options: RunWorkflowOptions): string {
  const authored = options.scriptText;
  const alreadyLowered = options.lowered;
  if (alreadyLowered !== undefined) return alreadyLowered;
  if (authored === undefined) {
    throw new Error("runWorkflowScript: pass either scriptText or lowered");
  }
  const compiled = lowerWorkflowScript(authored);
  if (compiled.ok && compiled.lowered !== undefined) return compiled.lowered.code;
  const locations = compiled.diagnostics.map(
    (item) => `${item.line}:${item.column} ${item.message}`,
  );
  const joined = locations.join("; ");
  throw new Error(
    `runWorkflowScript: the script failed compilation/analysis and is not run degraded: ${joined}`,
  );
}

/**
 * 落盘并 spawn。启动期的任何异常都先经引擎结算，再把「已结算」交回调用方——不把异常漏给
 * 调用方，理由见 settleLaunchFailure。
 */
export function launchSandbox(input: SandboxLaunchInput): LaunchOutcome {
  try {
    return { process: spawnSandbox(input, entryPathFor(input)) };
  } catch (cause) {
    return { settled: settleLaunchFailure(input.judge, cause) };
  }
}

/** 写入口文件：把 payload 渲染成自包含 ESM 落到磁盘，返回路径。 */
function entryPathFor(input: SandboxLaunchInput): string {
  const { workDir, runLabel, heapMb, body, options } = input;
  const written = writeChildEntryFile({
    cwd: workDir,
    runId: runLabel,
    source: renderChildEntry(payloadFor(input), { runId: runLabel }),
    onWarning: options.onWarning,
  });
  return written.path;
}

/**
 * 启动期故障一律结算成 stopped(interrupted)，不把异常抛给调用方。
 *
 * 为什么必须这样做：Node 只把 EACCES/EAGAIN/EMFILE/ENFILE/ENOENT 转成 error 事件，其余 spawn
 * 失败（ENAMETOOLONG、E2BIG…）同步抛；入口文件写不下（两个目录都失败）同理。异常直接冒出去
 * 会绕过引擎结算——注册表记成终态而 journal 行永远停在 running，随后的 resume_from 被
 * 「has not settled yet」拒绝。宿主侧故障可 resume，所以归到 interrupted 这一族。
 */
function settleLaunchFailure(judge: WorkflowEngine, cause: unknown): Promise<RunSettlement> {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const message = `Could not start the workflow sandbox process: ${detail}`;
  judge.stop("interrupted", new WorkflowError("Interrupted", message, { cause }));
  const settled: Promise<RunSettlement> = judge.settled;
  return settled;
}

/**
 * payload 的三部分：执行体、实参（可能有）、堆上限。
 *
 * 实参只在启动时过界一次（run 生命周期内是常量）。堆上限随 payload 进入口文件，只为 argsPrefix
 * 路径服务：那条路上没有 Node 旗标可传，入口文件只能自己 best-effort 设。
 */
function payloadFor(input: SandboxLaunchInput): ChildPayload {
  const carried: ChildPayload = { lowered: input.body, maxOldSpaceSizeMb: input.heapMb };
  const declaredArgs = input.options.args;
  if (declaredArgs !== undefined) carried.args = declaredArgs;
  return carried;
}

/**
 * spawn 子进程。argv 的形态由调用方是否给了 argsPrefix 决定：给了一个 Node 旗标都不带
 * （SEA 自 re-exec 跑不通旗标），缺省则带堆上限旗标。
 *
 * env 里的 ELECTRON_RUN_AS_NODE：桌面端 agent 由 Electron Helper 运行（process.execPath 指向
 * Helper），而 CLI 启动时会把该变量从自身 env 里清掉。不显式带上，子进程会按完整 Electron
 * 应用启动并卡在 GPU 初始化——永远沉默也不退出，run 卡死在 run-started。纯 Node 下该变量
 * 无效、无副作用。两条策略都要带：桌面打包态同样可能走 argsPrefix 路径。
 */
function spawnSandbox(input: SandboxLaunchInput, entryPath: string): ChildProcess {
  const prefix = input.options.childSpawn?.argsPrefix ?? [`--max-old-space-size=${input.heapMb}`];
  const childEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  const spawnOptions = { cwd: input.workDir, stdio: SANDBOX_STDIO, env: childEnv };
  return spawn(process.execPath, [...prefix, entryPath], spawnOptions);
}
