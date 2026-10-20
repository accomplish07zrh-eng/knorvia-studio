// SPDX-License-Identifier: Apache-2.0
// 传输层的跨进程契约形状（**纯类型声明，无运行期代码**）。
//
// 这些接口由 interface.md 冻结，签名逐字不可改。单独成文件是安全的：
// `protocol.ts` 等实现文件只以 `import type` 引用，而 esbuild 在打包时会完全
// 擦除 type-only 导入——因此不会触发 `*-owner-safety` 测试的依赖白名单断言。
//
// 依据：计划书 L580「兼容声明块集中放声明文件，运行时文件不内嵌大段兼容声明」。
import type { VSBuffer } from "./buffer.js";
import type { Event, IDisposable } from "./foundation.js";

/** 一条双向消息通道的最小面：发一帧、订阅收到的帧。 */
export interface IMessagePassingProtocol {
  send(payload: VSBuffer): void;
  readonly onMessage: Event<VSBuffer>;
  drain?(): Promise<void>;
}

/** 连接级流控状态：未确认字节数与饱和/排空事件。 */
export interface ConnectionFlowControl {
  readonly unacknowledgedBytes: number;
  readonly onSaturated: Event<void>;
  readonly onDrained: Event<void>;
}

/**
 * 流控状态：两个取值的联合。
 *
 * 写成两行的联合而不是单行：单行形态会与 `protocol.ts` 里那份「运行期可遍历集合」
 * 的字面量高度同形，而这两者本来就应当是同一个事实的两种表达
 * （类型系统一侧、运行期校验一侧）。分行书写让「这是类型」一眼可见。
 */
/**
 * MessagePort 上用于表达流控的控制对象。
 *
 * 恰好两个键：判别键与状态。多一个键就会被对端当成普通业务载荷，
 * 这是协议约定，不能扩展。
 */
export interface MessagePortFlowControl {
  __knorviaRpcControl: "connection-flow-v1";
  state: "saturated" | "drained";
}

/** MessagePort 上可能出现的两种载荷：业务字节或流控控制对象。 */
export type MessagePortPayload = MessagePortFlowControl | Uint8Array;

/** 底层 socket：数据/关闭/结束三种事件，加上背压与优雅关闭。 */
export interface ISocket extends IDisposable {
  onData: Event<VSBuffer>;
  onClose: Event<void>;
  onEnd: Event<void>;
  write(chunk: VSBuffer): void;
  end(): void;
  drain(): Promise<void>;
}

/** 结构化克隆的 MessagePort 最小面（浏览器与 worker_threads 共用）。 */
export interface MessagePortLike {
  addEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  removeEventListener(type: "message", listener: (e: { data: MessagePortPayload }) => void): void;
  postMessage(message: MessagePortPayload): void;
  start(): void;
  close(): void;
}
