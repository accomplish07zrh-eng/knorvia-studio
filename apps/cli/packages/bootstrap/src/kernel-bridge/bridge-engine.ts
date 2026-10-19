// SPDX-License-Identifier: Apache-2.0
// 桥引擎（段 A）：会话注册表 + 命令执行端口 + 方法路由；投影只经 interface.ts 调用。
// 骨架由工程小弟给定，段 A 只往函数体里填实现，不改签名。

import type { Context } from "@deepseek-ai/cordis";
import type { CommandAck, CommandEnvelope, RoutedTopicWireFrame } from "@knorvia/shared/protocol-v4";
import type { KernelLogger } from "../kernel/logger.js";
import type { BridgeCommandExecutor, CommandExecutionOutcome } from "./command-inbox.js";
import { BridgeCommandInbox } from "./command-inbox.js";
import type {
  BridgeEventProjectionLayer,
  BridgeFlowControlRequest,
  BridgeResyncRequest,
  BridgeResyncResult,
  BridgeSubscribeRequest,
  BridgeSubscribeResult,
  BridgeUnsubscribeRequest,
} from "./interface.js";
import { createBridgeEventProjectionLayer } from "./projection-layer.js";

export interface BridgeEngineOptions {
  readonly context: Context;
  readonly logger?: KernelLogger;
  /** 下行帧出口：entry.ts 注入，负责写 stdout NDJSON。 */
  readonly writeFrame: (frame: RoutedTopicWireFrame) => void;
  readonly now?: () => number;
}

/** 一个桥会话的注册信息（DSH 会话 id ↔ v4 会话 id）。 */
interface BridgeSessionRecord {
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly logEpoch: string;
}

export class BridgeEngine implements BridgeCommandExecutor {
  private readonly projection: BridgeEventProjectionLayer;
  private readonly inbox: BridgeCommandInbox;
  private readonly sessions = new Map<string, BridgeSessionRecord>();
  private readonly detachEvents: Array<() => void> = [];

  constructor(private readonly options: BridgeEngineOptions) {
    this.projection = createBridgeEventProjectionLayer({
      wireFrameSink: options.writeFrame,
      now: options.now,
    });
    // TODO(A): 按 command-inbox.ts 的构造参数接入 projection（revision/logEpoch 现读）。
    this.inbox = undefined as unknown as BridgeCommandInbox;
    void BridgeCommandInbox;
  }

  /** 订阅 ctx 的 session/event 等事件并转给 projection.ingestDshEvent。 */
  start(): void {
    throw new Error("TODO(A): attach DSH event listeners");
  }

  /** v4/command：准入（inbox）→ execute → ACK。 */
  async handleCommand(envelope: unknown): Promise<CommandAck> {
    void envelope;
    throw new Error("TODO(A): inbox admission + ack");
  }

  /** v4/commands/query。 */
  queryCommands(params: unknown): unknown {
    void params;
    throw new Error("TODO(A): commands query");
  }

  /** BridgeCommandExecutor：按命令类型执行，映射到 ctx.sessions / ctx.agents / projection.applyConfigMutation。 */
  async execute(envelope: CommandEnvelope): Promise<CommandExecutionOutcome> {
    void envelope;
    throw new Error("TODO(A): createSession / sendText / config mutations");
  }

  /** createSession：SessionId() 包装 id，logEpoch = `epoch_` + randomUUID，projection.initSession。 */
  private async createSession(envelope: CommandEnvelope): Promise<CommandExecutionOutcome> {
    void envelope;
    void this.sessions;
    throw new Error("TODO(A): createSession");
  }

  subscribe(request: BridgeSubscribeRequest): Promise<BridgeSubscribeResult> {
    return this.projection.subscribe(request);
  }

  resync(request: BridgeResyncRequest): Promise<BridgeResyncResult> {
    return this.projection.resync(request);
  }

  unsubscribe(request: BridgeUnsubscribeRequest): void {
    this.projection.unsubscribe(request);
  }

  setFlowControl(request: BridgeFlowControlRequest): void {
    this.projection.setFlowControl(request);
  }

  async dispose(): Promise<void> {
    for (const detach of this.detachEvents.splice(0)) detach();
    await this.projection.dispose?.();
  }
}
