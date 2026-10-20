// SPDX-License-Identifier: Apache-2.0
// 桥接上下文：一条子进程消息转交引擎时需要握着的几个句柄。
// 这些字段是运行期接线，不属于兼容面。
import type { ChildProcess } from "node:child_process";
import type { ActorId, WorkflowEngine } from "@knorvia/dynamic-workflow";
import type { ChildMessage } from "./protocol.js";

/** 桥接需要的四方：引擎、句柄映射表、子进程的写入端、失败入口。 */
export interface BridgeContext {
  workflow: WorkflowEngine;
  handles: Map<string, ActorId>;
  child: ChildProcess;
  /** 引擎级失败入口：脚本抛错与 createActor 失败都走它。 */
  fail: (error: import("@knorvia/dynamic-workflow").WorkflowError) => void;
}

/** 一条 child → parent 消息。 */
export type ChildFrame = ChildMessage;

/** 事件帧与请求帧的具体形状，供各处理函数使用。 */
export type EventFrame = Extract<ChildFrame, { kind: "event" }>;
export type RequestFrame = Extract<ChildFrame, { kind: "request" }>;
export type ActorFrame = Extract<ChildFrame, { kind: "create-actor" }>;
export type CompleteFrame = Extract<ChildFrame, { kind: "complete" }>;
