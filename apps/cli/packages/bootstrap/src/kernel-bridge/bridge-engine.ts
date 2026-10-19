// SPDX-License-Identifier: Apache-2.0
// 桥引擎（段 A）：会话注册表 + 命令执行端口 + 方法路由；投影只经 interface.ts 调用。
// 骨架由工程小弟给定，段 A 只往函数体里填实现，不改签名。

import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {
  CommandAck,
  CommandEnvelope,
  CommandPayloadMap,
  RoutedTopicWireFrame,
} from "@knorvia/shared/protocol-v4";
import type { KernelLogger } from "../kernel/logger.js";
import { callKernelLogger } from "../kernel/logger.js";
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

/** 段 A 尚未接入的命令类型统一回 failed + 该 reasonCode；不伪造 accepted/noop。 */
const UNSUPPORTED_REASON_CODE = "unsupported";

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
    this.inbox = new BridgeCommandInbox(this.projection, this);
  }

  /** 订阅 ctx 的 session/event 等事件并转给 projection.ingestDshEvent。 */
  start(): void {
    throw new Error("TODO(A): attach DSH event listeners");
  }

  /** v4/command：准入（inbox）→ execute → ACK。 */
  handleCommand(envelope: unknown): Promise<CommandAck> {
    return this.inbox.handle(envelope);
  }

  /** v4/commands/query。 */
  queryCommands(params: unknown): ReturnType<BridgeCommandInbox["query"]> {
    return this.inbox.query(params);
  }

  /** BridgeCommandExecutor：按命令类型执行，映射到 ctx.sessions / ctx.agents / projection.applyConfigMutation。 */
  async execute(envelope: CommandEnvelope): Promise<CommandExecutionOutcome> {
    // 段 A 只落 createSession；其余命令类型在实现前一律回 unsupported，不伪造成功。
    switch (envelope.type) {
      case "createSession":
        return await this.createSession(envelope);
      default:
        return { status: "failed", reasonCode: UNSUPPORTED_REASON_CODE };
    }
  }

  /** createSession：SessionId() 包装 id，logEpoch = `epoch_` + randomUUID，projection.initSession。 */
  private async createSession(envelope: CommandEnvelope): Promise<CommandExecutionOutcome> {
    const payload = envelope.payload as CommandPayloadMap["createSession"];
    // firstInput 需要 sendText 同一条 turn 写路径；输入投递未实现前不能建出“吞掉用户输入”的会话。
    if (payload.firstInput !== undefined) {
      return { status: "failed", reasonCode: UNSUPPORTED_REASON_CODE };
    }
    const sessionId = envelope.sessionId ?? `sess_${randomUUID()}`;
    const workspacePath = payload.workspaceId;
    const logEpoch = `epoch_${randomUUID()}`;

    this.options.context.sessions.create(SessionId(sessionId), {
      meta: { cwd: workspacePath },
    });
    this.projection.initSession({
      sessionId,
      logEpoch,
      workspacePath,
      initialConfig: payload.config,
    });
    this.sessions.set(sessionId, { sessionId, workspacePath, logEpoch });
    if (this.options.logger) {
      callKernelLogger(this.options.logger, "info", "kernel.bridge.session.created", {
        sessionId,
        workspacePath,
      });
    }
    return { status: "accepted", result: { type: "createSession", sessionId } };
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

  /** SIGTERM/SIGINT：停止接收事件并释放投影层（process.ts 调用后退出）。 */
  stop(): Promise<void> {
    return this.dispose();
  }

  async dispose(): Promise<void> {
    for (const detach of this.detachEvents.splice(0)) detach();
    await this.projection.dispose?.();
  }
}
