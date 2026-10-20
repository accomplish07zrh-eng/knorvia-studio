// SPDX-License-Identifier: Apache-2.0
// 父进程 harness 的编排入口。这个文件只做四件事：定执行体、建引擎、起沙箱、交给监督。
// 具体规则散在三个协作者里：执行体选择在 script-body.ts，沙箱启动在 sandbox-launch.ts，
// 收尾收敛在 run-supervision.ts；这里只负责把它们串成一条不可换序的流程。
//
// 本包只依赖 @knorvia/dynamic-workflow 与 node 内建——证明整条管线 app-free 可跑，绝不 import
// @knorvia/core、@knorvia/contracts、@knorvia/bootstrap 或 @knorvia/adapters。
import { createInterface } from "node:readline";
import {
  WorkflowEngine,
  type ActorId,
  type RunSettlement,
  type WorkflowReportSink,
} from "@knorvia/dynamic-workflow";
import { routeChildMessage } from "./child-bridge.js";
import type { BridgeContext } from "./bridge-types.js";
import { DEFAULT_MAX_OLD_SPACE_MB, launchSandbox, resolveLowered } from "./sandbox-launch.js";
import { runSupervision } from "./run-supervision.js";
import type { DriverFactory, RunWorkflowOptions } from "./harness-options.js";

export type { DriverFactory, RunWorkflowOptions } from "./harness-options.js";

/**
 * sink 晚绑定：引擎在 driver 之后构造，但 driver 需要 sink 回报，用转发代理打破这个环。
 * 每个成员都只是把同名调用转给引擎——注意必须保留接收者（`getEngine()[key](...)` 的调用形状），
 * 引擎的方法实现依赖 `this`，抽成裸函数引用会让 ask 的推进静默失效。
 */
function lateBoundSink(getEngine: () => WorkflowEngine): WorkflowReportSink {
  function forward<K extends keyof WorkflowReportSink>(key: K): WorkflowReportSink[K] {
    return ((...args: Parameters<WorkflowReportSink[K]>) => {
      const engine = getEngine();
      // 通过接收者调用，保留引擎方法内部的 `this`。
      const method = engine[key] as (...inner: Parameters<WorkflowReportSink[K]>) => void;
      method.apply(engine, args);
    }) as WorkflowReportSink[K];
  }
  return {
    askSubmitAttempted: forward("askSubmitAttempted"),
    askTurnEnded: forward("askTurnEnded"),
    askProgress: forward("askProgress"),
    askStats: forward("askStats"),
    askFailed: forward("askFailed"),
    // 确定性模型侧错误 → 整个 run 停下，同样只是转发。
    stopRun: forward("stopRun"),
    // 自适应并发的三个纯观察与 run 级停滞观察，同样只是转发。
    askWaiting: forward("askWaiting"),
    askExecuting: forward("askExecuting"),
    // 唯一会让引擎做决策的观察（关导入缓存），同样只是转发。
    askMutating: forward("askMutating"),
    concurrencyChanged: forward("concurrencyChanged"),
    runStalled: forward("runStalled"),
  };
}

/**
 * 跑一份 workflow 脚本至结算，返回引擎的 RunSettlement。
 *
 * 元数据一律 verbatim 转交引擎配置；缺省字段保持缺席（不落成 undefined 键）。cwd 同时是
 * 子进程的工作目录与落库的 `dwf_run.cwd`，两者必须是同一个值。
 */
export async function runWorkflowScript(options: RunWorkflowOptions): Promise<RunSettlement> {
  const lowered = resolveLowered(options);
  const runId = options.runId ?? "run";
  const cwd = options.cwd ?? process.cwd();
  const maxOldSpaceSizeMb = options.maxOldSpaceSizeMb ?? DEFAULT_MAX_OLD_SPACE_MB;

  let engine!: WorkflowEngine;
  const driver = options.makeDriver(lateBoundSink(() => engine));
  engine = new WorkflowEngine({
    runId,
    driver,
    caps: options.caps,
    askSpecs: options.askSpecs,
    validate: options.validate,
    ...presentSeed(options),
    cwd,
  });

  const launched = launchSandbox({
    judge: engine,
    workDir: cwd,
    runLabel: runId,
    heapMb: maxOldSpaceSizeMb,
    body: lowered,
    options,
  });
  if ("settled" in launched) return launched.settled;

  // local#N（child-local 句柄）→ engine ActorId；stdio FIFO + 同步 create-actor 处理保证任何
  // 引用某句柄的 ask 到达前该映射已就绪。
  const handles = new Map<string, ActorId>();
  const bridge: BridgeContext = {
    workflow: engine,
    handles,
    child: launched.process,
    fail: (error) => engine.fail(error),
  };
  return runSupervision({
    sandbox: launched.process,
    lines: createInterface({ input: launched.process.stdout! }),
    workflow: engine,
    actorHandles: handles,
    runLabel: runId,
    cancelSignal: options.signal,
    wallClockMs: options.timeoutMs,
    route: (message) => routeChildMessage(message, bridge),
  });
}

/** 落库元数据：只搬显式给出的字段，缺席的保持缺席。 */
function presentSeed(options: RunWorkflowOptions): Record<string, unknown> {
  const seed: Record<string, unknown> = {};
  const fields = [
    "scriptText",
    "name",
    "args",
    "scriptHash",
    "parentSessionId",
    "toolCallId",
    "resumedFrom",
    "launch",
    "importedCache",
    "inheritedTokens",
  ] as const;
  for (const field of fields) {
    if (options[field] !== undefined) seed[field] = options[field];
  }
  return seed;
}
