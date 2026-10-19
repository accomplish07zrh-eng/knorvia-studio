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
import { BRIDGE_REASON_CODES } from "./command-envelope.js";
import type { BridgeCommandExecutor, CommandExecutionOutcome } from "./command-inbox.js";
import { BridgeCommandInbox } from "./command-inbox.js";
import type {
  BridgeConfigMutationInput,
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

/** 同值切换的 noop reasonCode：与旧运行时 V4CommandNoopError 的 config.unchanged 同词表。 */
const CONFIG_UNCHANGED_REASON_CODE = "config.unchanged";

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
    // 段 A 已接入 createSession 与配置类命令；其余命令类型在实现前一律回 unsupported，不伪造成功。
    // 需要真实模型轮的命令（sendText 等）按 known-differences D17 保持 unsupported。
    switch (envelope.type) {
      case "createSession":
        return await this.createSession(envelope);
      case "setFollowupMode": {
        const payload = envelope.payload as CommandPayloadMap["setFollowupMode"];
        // 旧运行时 setFollowupMode 没有同值守卫（无条件追加一条事件），所以同值也必须
        // accepted，只是投影层产出 0 个 delta、revision 不动（B9「同值配置命令 accepted
        // 但快照不变、revision 不递增」）。这里若改成 noop 会与冻结的合同用例冲突。
        return this.applyConfigCommand(envelope, { followupMode: payload.mode }, false);
      }
      case "switchCollaborationMode": {
        const payload = envelope.payload as CommandPayloadMap["switchCollaborationMode"];
        // plan 是正交开关：resolveExecutionState 不会把 "plan" 写进 config.mode，
        // 只翻 planEnabled，因此这里与旧运行时一样把 plan 传成 planEnabled 而非 mode。
        // 旧运行时同值切换抛 V4CommandNoopError(config.unchanged) → ACK noop，
        // 客户端据此区分「已生效」与「本来就是这个值」。
        return this.applyConfigCommand(
          envelope,
          payload.mode === "plan"
            ? { planEnabled: true }
            : { mode: payload.mode, planEnabled: false },
          true,
        );
      }
      default:
        return { status: "failed", reasonCode: UNSUPPORTED_REASON_CODE };
    }
  }

  /**
   * 配置类命令的唯一执行路径：有效变更 accepted；投影层判定无可见变更时，
   * 按该命令在旧运行时的同值语义决定回 accepted 还是 noop（见 `noopOnSameValue`）。
   *
   * 无论哪种终态，投影层都已占用一个事件序号并按原序广播帧；ACK 的 revisionAtDecision
   * 由 CommandInbox 填执行前 revision（interface.md §四），这里不回传 revision，
   * 避免出现第二份 CAS 事实。
   */
  private applyConfigCommand(
    envelope: CommandEnvelope,
    mutation: BridgeConfigMutationInput["mutation"],
    noopOnSameValue: boolean,
  ): CommandExecutionOutcome {
    const sessionId = envelope.sessionId;
    // 会话存在性已由 CommandInbox 裁决；这里的空值只可能是 createSession 之外的协议违例。
    if (sessionId === null) {
      return {
        status: "failed",
        reasonCode: BRIDGE_REASON_CODES.sessionNotFound,
        message: `${envelope.type} requires a session`,
      };
    }
    const result = this.projection.applyConfigMutation({
      sessionId,
      commandId: envelope.commandId,
      type: envelope.type,
      mutation,
      // 两个命令都在 COMMANDS_REQUIRING_BASE_REVISION 内，CommandInbox 已把缺字段的信封
      // 拒在准入阶段；这里的兜底只满足类型，不会覆盖任何真实 CAS 值。
      baseRevision: envelope.baseRevision ?? 0,
    });
    // 0 delta 表示同值：revision 不推进，但这次命令仍占了一个事件序号。
    if (result.deltas.length === 0 && noopOnSameValue) {
      return { status: "noop", reasonCode: CONFIG_UNCHANGED_REASON_CODE };
    }
    return { status: "accepted" };
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
