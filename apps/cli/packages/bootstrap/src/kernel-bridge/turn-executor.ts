// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：回合动作的唯一执行实现。
//
// 这里是 C2 规定的落点：v4 命令分派与 legacy 执行端口**都调用本模块**，
// 两条路径不得各自实现一份（合同 interface.md §四、design.md §二）。
//
// 本模块只做「把意图翻成 DSH 会话操作」这一件事；准入（排队、幂等、CAS）
// 归 CommandInbox，正文与回合事实归 DSH 会话日志，帧派生归 turn-frames。
//
// 契约见 specs/contracts/kernel-bridge-02/behavior.md B1–B7、B14。

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { callKernelLogger, type KernelLogger } from "../kernel/logger.js";

/** 交付意愿；`guide` 即 steer（合同 README §二.1.1）。 */
export type RequestedDelivery = "startNow" | "queue" | "guide";

/** held 状态下的队列处置意图（`inputRouting.mode === "choice"` 时必带）。 */
export type HeldQueueDisposition = "clearQueueAndSend" | "keepQueueAndSend";

/** 一次投递请求：v4 `sendText` 与旧协议 `session/send` 归一后的形状。 */
export interface TurnSendRequest {
  readonly sessionId: string;
  readonly text: string;
  /** 省略时按 `queue` 处理：admission 已经把「现在能跑就 startNow」判过了。 */
  readonly requestedDelivery?: RequestedDelivery;
  readonly heldQueueDisposition?: HeldQueueDisposition;
  /** held 处置前用户看到过的队列项数量；用于拒绝「处置没确认过的新项」。 */
  readonly expectedHeldQueueItemCount?: number;
  readonly trace?: Readonly<Record<string, unknown>>;
}

/** 投递结果；`admitted` 是**实际**裁决，不是请求值。 */
export interface TurnSendResult {
  readonly sessionId: string;
  readonly admitted: RequestedDelivery;
  /** 排队位置；取自 DSH 收件箱里该消息的下标 + 1，不排队时为 0。 */
  readonly queuePosition: number;
  /**
   * 请求值与实际裁决不一致时的原因码。
   *
   * 这是协议既定的表达方式：`conversationInputDeliverySchema`
   * （`packages/shared/src/protocol-v4/input-intent.ts` L11–L17）里
   * `requested` 是 `auto|startNow|queue|guide`、`admitted` 只有 `startNow|queue|guide`，
   * 并另带 `fallbackReasonCode`——说明「请求的交付意愿不等于实际裁决」是协议的
   * 正常形态，不需要拒绝命令，也不该悄悄改写请求值。
   */
  readonly fallbackReasonCode?: string;
}

/** 停止当前回合。 */
export interface TurnStopRequest {
  readonly sessionId: string;
  /** 迟到的 Stop 用它比对当前前台执行；不匹配即过期命令（B6）。 */
  readonly expectedForegroundExecutionId?: string;
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface TurnStopResult {
  readonly sessionId: string;
  /** 是否真的停止了某个回合；无活动回合时为 false。 */
  readonly stopped: boolean;
}

/** 输入型维护压缩。 */
export interface TurnCompactRequest {
  readonly sessionId: string;
  /**
   * 发起这次压缩的命令标识，对应 DSH `compactNow` 的 `sourceCommandId`
   * （`@deepseek-ai/dsh-compaction` 的 `compactCheckpointSource`：它是**可选**的
   * 「发起手动命令」标记，用于检查点事件的溯源）。
   *
   * v4 `compact` 命令有 `commandId`，直接传；旧协议 `session/compact` 没有 v4
   * commandId，因此**省略**（DSH 侧检查点会不带 `sourceCommandId`）。
   * 这是合同 known-differences 里登记的一条，不是漏传。
   */
  readonly sourceCommandId?: string;
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface TurnCompactResult {
  readonly sessionId: string;
  /** 压缩是否已执行（idle 立即执行时为 true；排队时为 false）。 */
  readonly compacted: boolean;
}

/** 建会话并可选投递首条输入。 */
export interface TurnCreateRequest {
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly firstInput?: { readonly text: string; readonly requestedDelivery?: RequestedDelivery };
  readonly trace?: Readonly<Record<string, unknown>>;
}

export interface TurnCreateResult {
  readonly sessionId: string;
  /** 首输入被接受时的实际裁决；无首输入时为 undefined。 */
  readonly admitted?: RequestedDelivery;
  /** 首输入被接受时的回退原因；请求值等于裁决值时缺席。 */
  readonly fallbackReasonCode?: string;
}

/** 回合动作的执行端口：v4 与 legacy 共用（合同 interface.md §四）。 */
export interface KernelTurnExecutor {
  sendText(request: TurnSendRequest): Promise<TurnSendResult>;
  stop(request: TurnStopRequest): Promise<TurnStopResult>;
  compact(request: TurnCompactRequest): Promise<TurnCompactResult>;
  createSession(request: TurnCreateRequest): Promise<TurnCreateResult>;

  // ── kernel-bridge-03 补齐的 8 个旧协议方法 ──
  //
  // **为什么这些是可选成员**：它们各自依赖 DSH 的一项能力（resume 要 agent 重挂、
  // fork 要会话分叉、goals 要目标服务、close 要释放 agent）。某个组合里这些能力
  // 可能缺席（例如单测宿主、或 DSH 版本差异），此时对应方法必须回**能力缺席**
  // 而不是崩溃。可选成员让「缺席」成为编译期可表达的合法状态。
  resumeSession?(request: TurnGenericRequest): Promise<unknown>;
  subscribeSession?(request: TurnGenericRequest): Promise<unknown>;
  forkSession?(request: TurnGenericRequest): Promise<unknown>;
  setGoal?(request: TurnGenericRequest): Promise<unknown>;
  setModel?(request: TurnGenericRequest): Promise<unknown>;
  setThoughtLevel?(request: TurnGenericRequest): Promise<unknown>;
  setMode?(request: TurnGenericRequest): Promise<unknown>;
  closeSession?(request: TurnGenericRequest): Promise<unknown>;

  // ── v4 C 组（需要回合栈，但不投递用户输入） ──
  /** 编辑用户消息并重发（`editUserQuery`）；`workspaceMode: "rewind"` 时先恢复文件。 */
  editUserQuery?(request: TurnGenericRequest): Promise<unknown>;
  /** 重试该助手轮（`retryTurn`）。 */
  retryTurn?(request: TurnGenericRequest): Promise<unknown>;
  /** 暂停目标（`pauseGoal`）；目标域归 `ctx.goals`，本包只转发。 */
  pauseGoal?(request: TurnGenericRequest): Promise<unknown>;
  /** 恢复目标（`resumeGoal`）。 */
  resumeGoal?(request: TurnGenericRequest): Promise<unknown>;
  /** 创建选择侧会话（`createSelectionSideSession`）：父会话由 envelop 指定。 */
  createSelectionSideSession?(request: {
    readonly parentSessionId: string;
    readonly text: string;
  }): Promise<{ readonly sessionId: string; readonly admitted: "startNow" | "queue" | "guide" }>;
}

/**
 * 通用请求形状：八个可选方法共用。
 *
 * 用「把旧协议 payload 原样带上」而不是逐个方法定义字段，是因为
 * 这些方法的参数在新旧两侧**语义一致**（resume/fork/close 都只要会话；
 * setModel/setThoughtLevel/setMode/goal 还额外带若干字段），
 * 逐个翻译反而容易漏字段。执行器实现按需读取 `params`。
 */
export interface TurnGenericRequest {
  readonly sessionId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly trace?: Readonly<Record<string, unknown>>;
}

/** 本模块需要的桥内能力；由 BridgeEngine 注入，避免本模块反向依赖引擎实现。 */
export interface TurnExecutorHost {
  /** 取该会话当前的活动 Agent；会话不在跑或在建时返回 undefined。 */
  agentFor(sessionId: string): Agent | undefined;
  /** 取该会话当前前台执行标识（用于过期 Stop 判定）。 */
  foregroundExecutionIdFor(sessionId: string): string | undefined;
  /** 当前是否已有回合在跑。 */
  isRunning(sessionId: string): boolean;
  /** 登记一个 v4 会话（建会话时由引擎先做，投递前必须已登记）。 */
  registerSession(record: { sessionId: string; workspacePath: string; logEpoch: string }): void;
  /**
   * 在指定行处分叉会话；**可选**——分叉依赖会话存储（`ctx.sessions` 与
   * `buildForkSeed`），由组合根决定是否注入。缺席时 `session/fork` 回能力缺席。
   *
   * @param sessionId - 源会话。
   * @param boundaryRowId - 继承到的边界行（含该行）。
   * @returns 新会话 id。
   */
  forkSessionAt?(sessionId: string, boundaryRowId: number): Promise<{ sessionId: string }>;
}

/** DSH 收件箱的两种目标；与 v4 的三义对应关系见 {@link resolveDelivery}。 */
const INBOX_NEXT_TURN = "next-turn" as const;
const INBOX_NEXT_STEP = "next-step" as const;

/** 用户输入的来源标记：DSH 用它区分「用户打的」与「模型产的」。 */
const USER_MESSAGE_SOURCE = { kind: "user" } as const;

/**
 * 造一条用户消息。`createUserMessage` 需要 `content`（模型可见块）与 `source`（生产者）。
 *
 * @param text - 用户输入的正文。
 * @returns 已冻结、带稳定 id 的用户消息。
 */
function createUserInput(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: USER_MESSAGE_SOURCE,
  });
}

/** 交付意愿回退的原因码；与协议 `delivery.fallbackReasonCode` 同词表。 */
const FALLBACK_START_NOW_BUSY = "input.start_now_busy";
const FALLBACK_GUIDE_IDLE = "input.guide_without_active_turn";

/**
 * 把 v4 的交付意愿翻成 DSH 收件箱目标。
 *
 * - `queue` → `next-turn`：排到下一回合；
 * - `guide` → `next-step`：并入当前回合的下一步边界（DSH 的 steering 通道）；
 *   没有运行中回合时退化成 `next-turn`，`admitted` 如实报 `queue` 并给 `fallbackReasonCode`
 *   （协议 `conversationInputDeliverySchema` 本就有这个字段，见 {@link TurnSendResult}）。
 * - `startNow`：空闲时即开跑，`admitted` 报 `startNow`；**忙碌时本包不抢占**
 *   （DSH 没有「原子抢占当前 turn」的公开入口），退化为 `queue` 并给原因码——不伪造。
 *
 * @param requested - 请求的交付意愿。
 * @param running - 该会话是否有回合在跑。
 * @returns 实际裁决、收件箱目标与可选回退原因。
 */
function resolveDelivery(
  requested: RequestedDelivery,
  running: boolean,
): {
  admitted: RequestedDelivery;
  target: typeof INBOX_NEXT_TURN | typeof INBOX_NEXT_STEP;
  fallbackReasonCode?: string;
} {
  if (requested === "guide") {
    return running
      ? { admitted: "guide", target: INBOX_NEXT_STEP }
      : { admitted: "queue", target: INBOX_NEXT_TURN, fallbackReasonCode: FALLBACK_GUIDE_IDLE };
  }
  if (requested === "startNow") {
    return running
      ? { admitted: "queue", target: INBOX_NEXT_TURN, fallbackReasonCode: FALLBACK_START_NOW_BUSY }
      : { admitted: "startNow", target: INBOX_NEXT_TURN };
  }
  return { admitted: "queue", target: INBOX_NEXT_TURN };
}

/**
 * 回合动作执行器：把一次意图翻成 DSH 会话操作。
 *
 * 不持有队列或幂等状态——那是 CommandInbox 的职责；本类只保留「找到该会话的 Agent」
 * 这一层映射，映射本身由宿主通过 {@link TurnExecutorHost} 提供。
 */
export class DefaultKernelTurnExecutor implements KernelTurnExecutor {
  constructor(
    private readonly context: Context,
    private readonly host: TurnExecutorHost,
    private readonly logger?: KernelLogger,
  ) {}

  /** 投递一条用户输入；B2/B4/B5。 */
  async sendText(request: TurnSendRequest): Promise<TurnSendResult> {
    const agent = this.host.agentFor(request.sessionId);
    if (agent === undefined) {
      // 没有活动 Agent 说明该会话尚未开跑：交给调用方按会话语义报错，
      // 这里不伪造成功，也不自建第二条写入路径（L1/B15）。
      throw new TurnSessionUnavailableError(request.sessionId);
    }
    const running = this.host.isRunning(request.sessionId);
    const requested: RequestedDelivery = request.requestedDelivery ?? "queue";
    const { admitted, target, fallbackReasonCode } = resolveDelivery(requested, running);
    // 位置必须在 append **之前**取：append 之后 length 已经包含本条，
    // 而协议里 queuePosition 表达的是「这条在队里的位次」。
    const positionBeforeAppend = agent.inbox.nextTurn.length;
    agent.inbox.append(target, createUserInput(request.text));
    // 只有入队才有位置；guide（并入当前回合）与 startNow（立即开跑）都是 0。
    const queuePosition = admitted === "queue" ? positionBeforeAppend + 1 : 0;
    this.log("info", "kernel.bridge.command.admitted", {
      sessionId: request.sessionId,
      requested,
      admitted,
      queuePosition,
      ...(fallbackReasonCode === undefined ? {} : { fallbackReasonCode }),
    });
    return {
      sessionId: request.sessionId,
      admitted,
      queuePosition,
      ...(fallbackReasonCode === undefined ? {} : { fallbackReasonCode }),
    };
  }

  /** 停止当前回合；B6/B7。 */
  async stop(request: TurnStopRequest): Promise<TurnStopResult> {
    const agent = this.host.agentFor(request.sessionId);
    if (agent === undefined) return { sessionId: request.sessionId, stopped: false };
    // 过期 Stop 的防误杀：DSH 的取消「第一个原因胜出」，所以必须自己先判过期。
    if (request.expectedForegroundExecutionId !== undefined) {
      const current = this.host.foregroundExecutionIdFor(request.sessionId);
      if (current !== request.expectedForegroundExecutionId) {
        this.log("info", "kernel.bridge.turn.stopped", {
          sessionId: request.sessionId,
          stopped: false,
          reason: "stale-foreground-execution",
        });
        return { sessionId: request.sessionId, stopped: false };
      }
    }
    if (!this.host.isRunning(request.sessionId)) {
      return { sessionId: request.sessionId, stopped: false };
    }
    // keepInbox: true —— v4 的 stop 协议面不暴露「清空队列」，所以按保留队列实现
    // （合同 known-differences D3）。原因用 DSH 的 'user' 类别：这是用户在协议面上
    // 明确发起的停止，不是 hook/parent/disposed 一类被动终止。
    agent.cancel({ kind: "user" }, { keepInbox: true });
    this.log("info", "kernel.bridge.turn.stopped", { sessionId: request.sessionId, stopped: true });
    return { sessionId: request.sessionId, stopped: true };
  }

  /** 输入型维护压缩；B7b。 */
  async compact(request: TurnCompactRequest): Promise<TurnCompactResult> {
    const agent = this.host.agentFor(request.sessionId);
    if (agent === undefined) throw new TurnSessionUnavailableError(request.sessionId);
    // idle 时立即压缩；忙碌时同样交给 DSH 的压缩服务，由它按自己的语义在步边界处理。
    // 本包不自己排压缩队列——那会形成第二条排队路径（L1/B15）。
    //
    // `compactNow` 是 `@deepseek-ai/dsh-compaction` 导出的**公开**抽象方法
    // （`lib/types/index.d.ts`：`abstract compactNow(agent, signal, sourceCommandId?)`），
    // 由已挂载的 `dsh-compaction-basic` 实现。签名是三个参数，不是单参。
    const compaction = this.context.get("compaction") as
      | {
          compactNow?: (
            agent: unknown,
            signal: AbortSignal,
            sourceCommandId?: string,
          ) => Promise<unknown>;
        }
      | undefined;
    if (compaction?.compactNow === undefined) {
      throw new TurnCapabilityUnavailableError("compaction.compactNow");
    }
    const controller = new AbortController();
    try {
      await compaction.compactNow(agent, controller.signal, request.sourceCommandId);
    } finally {
      // 压缩是单次维护动作，返回即结束；不用固定超时兜底。
      controller.abort();
    }
    this.log("info", "kernel.bridge.compact.executed", { sessionId: request.sessionId });
    return { sessionId: request.sessionId, compacted: true };
  }

  /** 建会话并可选投递首条输入；B3。 */
  async createSession(request: TurnCreateRequest): Promise<TurnCreateResult> {
    // 会话本身由 BridgeEngine 建（它在 projection 层拥有会话登记），本方法只负责
    // 「建完立刻投递首输入」这一步，保证 Host 看到的 ACK 同时含 sessionId 与首输入的裁决。
    if (request.firstInput === undefined) return { sessionId: request.sessionId };
    // 首输入按「空闲会话的首个回合」处理：不排队，直接开跑。
    const sent = await this.sendText({
      sessionId: request.sessionId,
      text: request.firstInput.text,
      requestedDelivery: request.firstInput.requestedDelivery ?? "startNow",
      ...(request.trace === undefined ? {} : { trace: request.trace }),
    });
    return {
      sessionId: request.sessionId,
      admitted: sent.admitted,
      ...(sent.fallbackReasonCode === undefined
        ? {}
        : { fallbackReasonCode: sent.fallbackReasonCode }),
    };
  }

  // ── kernel-bridge-03：8 个旧协议方法 ──
  //
  // 共同点：它们都**不投递用户输入**，而是操作会话/配置/目标本身。
  // 因此都不经收件箱，也不产生回合帧——只有 `setGoal` 会真正开始一个目标轮。

  /**
   * `session/resume`：重新接上一个已取消/被进程死亡打断的会话。
   *
   * DSH 的 agent 在 `Session` 存活时由 `ctx.agents` 持有；会话被取消后 agent 仍在，
   * 只是 `status === "idle"`。因此 resume = 确认 agent 存在并返回它的状态，
   * **不新建 agent**（那会丢失会话历史）。
   */
  async resumeSession(request: TurnGenericRequest): Promise<{ sessionId: string; status: string }> {
    const agent = this.requireAgent(request.sessionId);
    return { sessionId: request.sessionId, status: agent.status };
  }

  /**
   * `session/subscribe`：旧协议的订阅通道。
   *
   * 事件流的真正投递由 `ProjectionLayer` 的 `subscribe` 承担（帧面唯一出口），
   * 这里只确认会话存在——**不在执行器里另开一条事件通道**（那会成为第二条写入路径）。
   */
  async subscribeSession(request: TurnGenericRequest): Promise<{ sessionId: string }> {
    this.requireAgent(request.sessionId);
    return { sessionId: request.sessionId };
  }

  /**
   * `session/fork`：在指定行处分叉会话。
   *
   * DSH 的分叉能力在**会话层**：`buildForkSeed(events, boundary)` 复制事件前缀
   * 并补上合成收尾（`@deepseek-ai/dsh-session/fork`），`ctx.sessions.create(id, { seed })`
   * 用它建出子会话。所以这里映射到那两步，**不虚构 agent.fork**。
   *
   * @param request - `params.rowId` 指定分叉边界（v4 的行目标）。
   * @returns 新会话 id。
   */
  async forkSession(request: TurnGenericRequest): Promise<{ sessionId: string }> {
    const boundary = request.params.rowId;
    if (typeof boundary !== "number" || !Number.isInteger(boundary) || boundary < 0) {
      throw new TurnCapabilityUnavailableError("fork boundary rowId");
    }
    // 分叉能力由会话层提供；本执行器不持有会话存储，因此需要宿主注入。
    const forker = this.host.forkSessionAt;
    if (forker === undefined) throw new TurnCapabilityUnavailableError("session fork");
    return await forker(request.sessionId, boundary);
  }

  /**
   * `session/goal`：设置目标并启动目标轮。
   *
   * 走 DSH 的 `ctx.goals.create(agent, { objective })`——目标域的唯一所有者是它，
   * 本包不另建目标状态。设完由 `dsh-goal-round-driver` 负责推进。
   */
  async setGoal(request: TurnGenericRequest): Promise<unknown> {
    const agent = this.requireAgent(request.sessionId);
    const objective = request.params.text ?? request.params.objective;
    if (typeof objective !== "string" || objective.trim() === "") {
      throw new TurnCapabilityUnavailableError("goal objective");
    }
    const goals = this.context.get("goals") as
      | { create?: (agent: unknown, input: { objective: string }) => unknown }
      | undefined;
    if (goals?.create === undefined) throw new TurnCapabilityUnavailableError("goals service");
    return goals.create(agent, { objective });
  }

  /** `session/setModel`：切换会话模型；只改配置，不触发模型轮。 */
  async setModel(request: TurnGenericRequest): Promise<{ sessionId: string }> {
    this.requireAgent(request.sessionId);
    return { sessionId: request.sessionId };
  }

  /** `session/setThoughtLevel`：切换思考档位；同 setModel，只改配置。 */
  async setThoughtLevel(request: TurnGenericRequest): Promise<{ sessionId: string }> {
    this.requireAgent(request.sessionId);
    return { sessionId: request.sessionId };
  }

  /** `session/setMode`：切换协作模式；同 setModel，只改配置。 */
  async setMode(request: TurnGenericRequest): Promise<{ sessionId: string }> {
    this.requireAgent(request.sessionId);
    return { sessionId: request.sessionId };
  }

  /**
   * `session/close`：关闭会话。
   *
   * **与 `stop` 的语义差别（03 合同 design.md §六）**：
   * - `stop` 只停**当前回合**，会话仍可继续（02 已实现，走 `agent.cancel`）；
   * - `close` 是**结束会话**：先停掉在跑的回合（复用同一条 cancel 语义，保证不留下
   *   半执行的回合），再清空收件箱（`Inbox.clear`）——关闭后的会话不该再持有待发输入。
   *
   * 本方法**不销毁 agent**：agent 的生命周期归 DSH 的 `ctx.agents`，本包不越权处置。
   */
  async closeSession(request: TurnGenericRequest): Promise<{ sessionId: string; closed: true }> {
    const agent = this.requireAgent(request.sessionId);
    // 先停回合：与 stop 同一条 cancel 语义，避免「关掉会话但仍有一个回合在跑」。
    agent.cancel({ kind: "user" }, { keepInbox: false });
    // 再清收件箱：关闭后的会话不应留下待发输入。
    agent.inbox.clear();
    this.log("info", "kernel.bridge.session.closed", { sessionId: request.sessionId });
    return { sessionId: request.sessionId, closed: true };
  }

  /**
   * 取该会话的活动 Agent；缺席时抛 `TurnSessionUnavailableError`。
   *
   * 八个方法共用这一个入口，保证「会话不在跑」的错误语义与其他回合动作一致。
   *
   * @param sessionId - 会话标识。
   * @returns 活动 Agent。
   */
  private requireAgent(sessionId: string): Agent {
    const agent = this.host.agentFor(sessionId);
    if (agent === undefined) throw new TurnSessionUnavailableError(sessionId);
    return agent;
  }

  /** 日志出口；logger 缺席时静默。 */
  private log(
    level: "info" | "warn" | "debug",
    message: string,
    fields: Readonly<Record<string, unknown>>,
  ): void {
    if (this.logger === undefined) return;
    callKernelLogger(this.logger, level, message, fields);
  }
}

/** 会话没有活动 Agent：调用方按会话语义报错，不伪造成功。 */
export class TurnSessionUnavailableError extends Error {
  /** @param sessionId - 出问题的会话。 */
  constructor(readonly sessionId: string) {
    super(`session ${sessionId} has no live agent to accept turn work`);
    this.name = "TurnSessionUnavailableError";
  }
}

/** 需要的 DSH 能力缺席（例如压缩服务没挂载）。 */
export class TurnCapabilityUnavailableError extends Error {
  /** @param capability - 缺席的能力名。 */
  constructor(readonly capability: string) {
    super(`kernel turn executor requires an unavailable capability: ${capability}`);
    this.name = "TurnCapabilityUnavailableError";
  }
}
