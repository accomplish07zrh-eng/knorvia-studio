// SPDX-License-Identifier: Apache-2.0
// 收尾监督的形状。分三组：运行期句柄（起监督时才有值）、停止政策（调用方给），
// 以及两者合并后的输入。
import type { ChildProcess } from "node:child_process";
import type { Interface } from "node:readline";
import type { ActorId, WorkflowEngine } from "@knorvia/dynamic-workflow";
import type { ChildMessage } from "./protocol.js";

/**
 * 监督期间一直握着的运行期句柄。
 *
 * 逐项说明握着的理由：子进程给退出与错误事件；读取接口把 stdout 切成行；引擎是唯一能给出
 * 结算的地方；句柄表让 ask 找到目标 actor；route 把解析好的消息交回上层（本模块不认识引擎
 * 方法，只知道「该转交了」）。
 */
export interface RunWatchHandles {
  sandbox: ChildProcess;
  lines: Interface;
  workflow: WorkflowEngine;
  actorHandles: Map<string, ActorId>;
  route: (message: ChildMessage) => void;
}

/**
 * 停止政策。
 *
 * `cancelSignal` 是外部取消的唯一来源，`wallClockMs` 是墙钟上限（缺省不限），`runLabel` 只在
 * interrupted 那一支的错误文本里出现——它让同一条 run 的失败能在详情页与 journal 之间对上号。
 */
export interface RunWatchPolicy {
  runLabel: string;
  cancelSignal?: AbortSignal;
  wallClockMs?: number;
}

/** 起监督所需的完整输入：句柄与政策各自独立，这里只是把两组放在一起。 */
export type SupervisionInput = RunWatchHandles & RunWatchPolicy;
