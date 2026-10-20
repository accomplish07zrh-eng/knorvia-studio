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
import { TurnApprovalRegistry } from "./turn-approval.js";
import {
  DefaultKernelTurnExecutor,
  type KernelTurnExecutor,
  TurnSessionUnavailableError,
} from "./turn-executor.js";
import { deliverFirstInput, dispatchTurnCommand } from "./turn-commands.js";
import { createAgentLookupHost, registerTurnExecutionPort } from "./legacy-port/register.js";

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
  /**
   * 回合动作执行器（kernel-bridge-02）。缺席时回合类命令保持 unsupported，
   * 用于只跑段 A 骨架的场景与 legacy 反向断言测试。
   */
  readonly turnExecutor?: KernelTurnExecutor;
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
  /**
   * 未决审批登记表（kernel-bridge-02 B9/B10）。
   *
   * 放在引擎上而不是 turn-executor 上，是因为**关闭路径**必须能把它整体收敛：
   * `dispose()` 是引擎的职责，执行器不知道进程要退出。
   */
  readonly approvals = new TurnApprovalRegistry();

  constructor(private readonly options: BridgeEngineOptions) {
    this.projection = createBridgeEventProjectionLayer({
      wireFrameSink: options.writeFrame,
      now: options.now,
    });
    this.inbox = new BridgeCommandInbox(this.projection, this);
    this.turnExecutor =
      options.turnExecutor ??
      new DefaultKernelTurnExecutor(
        options.context,
        createAgentLookupHost(options.context),
        options.logger,
      );
  }

  /**
   * 回合动作执行器：v4 命令路径与 legacy 执行端口**共用这一个实例**（C2）。
   *
   * 为什么由引擎自建而不是外部注入：`runBridge`（`entry.ts`）是本包唯一 `new BridgeEngine`
   * 的地方，而它归 `kernel-bridge-legacy` 的边界（本包合同 interface.md §五：`entry.ts`
   * 的 `route()` 与 `RunBridgeOptions` 不动）。因此执行器在引擎内部物化，
   * 由 `start()` 注册到 legacy 的端口——两条路径拿到的仍是同一个对象。
   *
   * 外部若显式给了 `turnExecutor`（测试或将来组合根接管），就用外部那个。
   */
  readonly turnExecutor: KernelTurnExecutor;

  /** 已注册的 legacy 执行端口；`dispose()` 时解绑。 */
  private turnPort: { release(): void } | undefined;

  /** 订阅 ctx 的 session/event 等事件并转给 projection.ingestDshEvent。 */
  start(): void {
    // interface.md §六.4：DSH session/event 是会话事实的唯一来源，桥只在事件提交后转发。
    // 只投影本桥登记的会话：宿主自己创建的 agent 会话没有 v4 身份，不能混进协议面。
    const detach = this.options.context.on("session/event", (session, event) => {
      if (!this.sessions.has(session.id)) return;
      this.projection.ingestDshEvent({ sessionId: session.id, event });
    });
    this.detachEvents.push(detach);
    this.attachLegacyTurnPort();
  }

  /**
   * 把本包的执行器注册成 legacy 的执行端口（C2 的落地动作）。
   *
   * 只在 `start()` 里做一次，且失败不致命：legacy 的注册面是「单所有者、重复注册抛错」，
   * 若同一进程已经有别的所有者（例如测试先注册过），本包不抢——记 debug 后跳过，
   * 此时旧协议回合方法由那个所有者处理，capability 缺席语义仍是合法的临时态。
   */
  private attachLegacyTurnPort(): void {
    try {
      this.turnPort = registerTurnExecutionPort(this.turnExecutor);
    } catch (error) {
      if (this.options.logger) {
        callKernelLogger(this.options.logger, "debug", "kernel.bridge.legacy.port.unavailable", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
      // ── kernel-bridge-02：输入与回合（合同 behavior.md B1–B7）；分派在 turn-commands.ts ──
      case "sendText":
      case "stop":
      case "compact":
        return await dispatchTurnCommand(envelope, this.options.turnExecutor);
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
    const executor = this.options.turnExecutor;
    // 有 firstInput 但没有回合执行器：仍然不能建出「吞掉用户输入」的会话（段 A 的旧口径）。
    if (payload.firstInput !== undefined && executor === undefined) {
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
    // B3（首输入投递）在 turn-commands.ts：那段逻辑与本包其余回合语义同属一处，
    // 引擎只负责「先建会话，再交给它」；失败回滚也由它调 forgetSession 做。
    const delivered = await deliverFirstInput(envelope, executor, (id) => this.sessions.delete(id));
    if (delivered !== undefined) return delivered;
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
    // 关闭时把未决审批全部结算为 unavailable：否则 Host 侧的审批请求永远等不到应答，
    // 会挂着一个永不返回的反向请求（与 legacy 的「反向请求先收口」同一族问题）。
    // 这条必须在释放投影层**之前**做——投影层释放后就没有通道可以回执了。
    this.approvals.failAllPending();
    // 再解绑执行端口：本包注入的能力必须随引擎一起撤走，
    // 不留一个指向已释放引擎的悬挂端口（否则后续旧协议请求会打到废对象上）。
    this.turnPort?.release();
    this.turnPort = undefined;
    for (const detach of this.detachEvents.splice(0)) detach();
    await this.projection.dispose?.();
  }
}
