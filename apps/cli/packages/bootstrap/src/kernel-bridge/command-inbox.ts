// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01 段 A：v4/command 准入、幂等回放与 v4/commands/query（合同 interface.md 第四节）
//
// 事实分两层，互不混用：
//   - running：命令正在执行；同 key 的重试挂到同一个终态 Promise 上等待，不重复裁决或执行。
//   - settled：执行终态与 noop 的回放记录，每个会话最多 512 条，超出按写入顺序淘汰。
//     拒绝与 stale 不属于终态事实，不缓存；同一 commandId 重试必须重新裁决。
//
// 裁决顺序是合同的一部分：会话存在 → CAS 字段完整性 → logEpoch → revision。
// 顺序不得按“先便宜后昂贵”重排：baseLogEpoch 必须先于 baseRevision 比较。

import {
  PROTOCOL_V4_LIMITS,
  type CommandAck,
  type CommandEnvelope,
} from "@knorvia/shared/protocol-v4";
import {
  BRIDGE_REASON_CODES,
  buildCommandAck,
  buildCommandsQueryResult,
  duplicateAck,
  invalidPayloadAck,
  parseBridgeCommandEnvelope,
  parseBridgeCommandsQuery,
  peekCommandId,
  requiresBaseRevision,
  sessionNotFoundAck,
  staleLogEpochAck,
  staleRevisionAck,
  targetsRows,
} from "./command-envelope.js";
import type { BridgeEventProjectionLayer, BridgeSessionState } from "./interface.js";

const SETTLED_LIMIT_PER_SESSION = PROTOCOL_V4_LIMITS.idempotencyTablePerSession;

/** 命令执行端口：桥只提供执行能力，不在这里实现任何业务语义。 */
export interface BridgeCommandExecutor {
  /**
   * 执行已通过准入的命令并返回执行层终态（status/reasonCode/message/result）。
   * 只有在执行完成时才 resolve；抛错会被调用方翻译成 `failed`。
   */
  execute(envelope: CommandEnvelope): Promise<CommandExecutionOutcome>;
}

/** 执行层终态；`status` 只允许终态值，accepted 之外必须有 reasonCode。 */
export interface CommandExecutionOutcome {
  readonly status: "accepted" | "noop" | "failed";
  readonly reasonCode?: string;
  readonly message?: string;
  readonly result?: CommandAck["result"];
}

/** 查询单 key 的结果；`undefined` → 调用方回 `"unknown"`。 */
export type CommandLookup = CommandAck | undefined;

/** 正在执行的命令：completion 在执行收口时兑现一次。 */
interface RunningCommand {
  readonly completion: Promise<CommandAck>;
  settle(ack: CommandAck): void;
}

/** 一个会话的全部命令事实；全局桶（sessionId=null）同样占一份。 */
interface SessionLedger {
  readonly running: Map<string, RunningCommand>;
  readonly settled: Map<string, CommandAck>;
}

/** 准入裁决：带执行前 revision 放行，或直接回一条 ACK。 */
type Arbitration =
  | { readonly admitted: true; readonly startRevision: number }
  | { readonly admitted: false; readonly ack: CommandAck };

/**
 * 命令准入 + 幂等缓存。
 *
 * 该类不持有投影层状态：CAS 判定所需的 revision/logEpoch 每次从投影层现读，
 * 避免桥内出现第二份 revision 事实源。
 */
export class BridgeCommandInbox {
  private readonly ledgers = new Map<string, SessionLedger>();

  constructor(
    private readonly projection: BridgeEventProjectionLayer,
    private readonly executor: BridgeCommandExecutor,
  ) {}

  /** 处理 v4/command：任何输入都收敛为一条 ACK，从不抛协议错误（合同 §3）。 */
  async handle(raw: unknown): Promise<CommandAck> {
    const parsed = parseBridgeCommandEnvelope(raw);
    if (!parsed.ok) return invalidPayloadAck(peekCommandId(raw), { message: parsed.message });
    return await this.admit(parsed.envelope);
  }

  /** 处理 v4/commands/query：已 settled 的 key 一律回缓存 ACK，不得回退 unknown。 */
  query(raw: unknown): ReturnType<typeof buildCommandsQueryResult> | undefined {
    const params = parseBridgeCommandsQuery(raw);
    if (params === undefined) return undefined;
    return buildCommandsQueryResult(params, (sessionId, commandId) =>
      this.ledgers.get(sessionKeyOf(sessionId))?.settled.get(commandId),
    );
  }

  /** 会话销毁时丢弃它的账面；在途命令仍会执行完，但不再进入本会话缓存。 */
  forgetSession(sessionId: string): void {
    this.ledgers.delete(sessionKeyOf(sessionId));
  }

  private async admit(envelope: CommandEnvelope): Promise<CommandAck> {
    const ledgerKey = sessionKeyOf(envelope.sessionId);
    const ledger = this.ledgers.get(ledgerKey);

    const running = ledger?.running.get(envelope.commandId);
    if (running !== undefined) return duplicateAck(envelope.commandId, await running.completion);

    const replay = ledger?.settled.get(envelope.commandId);
    if (replay !== undefined) return duplicateAck(envelope.commandId, replay);

    const arbitration = this.arbitrate(envelope);
    if (!arbitration.admitted) return arbitration.ack;
    return await this.perform(envelope, ledgerKey, arbitration.startRevision);
  }

  private async perform(
    envelope: CommandEnvelope,
    ledgerKey: string,
    startRevision: number,
  ): Promise<CommandAck> {
    const running = this.beginRunning(ledgerKey, envelope.commandId);
    const final = await this.invokeExecutor(envelope, startRevision);

    const ledger = this.ledgerFor(ledgerKey);
    ledger.running.delete(envelope.commandId);
    this.rememberSettled(ledger, envelope.commandId, final);
    running.settle(final);
    return final;
  }

  /** 先登记 running 再开始执行：执行期间的重复请求必须能等到同一次终态。 */
  private beginRunning(ledgerKey: string, commandId: string): RunningCommand {
    let settle!: (ack: CommandAck) => void;
    const completion = new Promise<CommandAck>((resolve) => {
      settle = resolve;
    });
    const running: RunningCommand = { completion, settle };
    this.ledgerFor(ledgerKey).running.set(commandId, running);
    return running;
  }

  private async invokeExecutor(
    envelope: CommandEnvelope,
    startRevision: number,
  ): Promise<CommandAck> {
    try {
      const outcome = await this.executor.execute(envelope);
      return outcomeAck(envelope.commandId, outcome.status, startRevision, outcome);
    } catch (error) {
      return outcomeAck(envelope.commandId, "failed", startRevision, {
        reasonCode: reasonCodeOf(error),
        message: messageOf(error),
      });
    }
  }

  /** 纯裁决：只看投影层当前状态，不写缓存、不产生副作用。 */
  private arbitrate(envelope: CommandEnvelope): Arbitration {
    // createSession 的幂等键是全局桶，会话存在性由执行结果回答，不参与 sessionNotFound 判定。
    if (envelope.type === "createSession") {
      return { admitted: true, startRevision: 0 };
    }

    const state = this.sessionStateOf(envelope);
    if (state === undefined) {
      return {
        admitted: false,
        ack: sessionNotFoundAck(envelope.commandId, envelope.sessionId ?? ""),
      };
    }

    const veto =
      this.vetoByFields(envelope, state) ??
      this.vetoByEpoch(envelope, state) ??
      this.vetoByRevision(envelope, state);
    return veto === undefined
      ? { admitted: true, startRevision: state.revision }
      : { admitted: false, ack: veto };
  }

  private sessionStateOf(envelope: CommandEnvelope): BridgeSessionState | undefined {
    if (envelope.sessionId === null) return undefined;
    return this.projection.getSessionState(envelope.sessionId);
  }

  /** CAS 命令缺 baseRevision 属信封非法，必须先于任何状态比较。 */
  private vetoByFields(
    envelope: CommandEnvelope,
    state: BridgeSessionState,
  ): CommandAck | undefined {
    if (!requiresBaseRevision(envelope.type) || envelope.baseRevision !== undefined) {
      return undefined;
    }
    return buildCommandAck({
      commandId: envelope.commandId,
      status: "rejected",
      reasonCode: BRIDGE_REASON_CODES.invalidPayload,
      message: `${envelope.type} requires baseRevision`,
      revisionAtDecision: state.revision,
    });
  }

  /** 代际先于 revision：过期 epoch 的 baseRevision 比较没有意义。 */
  private vetoByEpoch(
    envelope: CommandEnvelope,
    state: BridgeSessionState,
  ): CommandAck | undefined {
    if (!targetsRows(envelope.type) || envelope.baseLogEpoch === state.logEpoch) return undefined;
    return staleLogEpochAck(envelope.commandId, state.revision);
  }

  private vetoByRevision(
    envelope: CommandEnvelope,
    state: BridgeSessionState,
  ): CommandAck | undefined {
    const { baseRevision } = envelope;
    if (baseRevision === undefined || baseRevision === state.revision) return undefined;
    return staleRevisionAck(envelope.commandId, state.revision);
  }

  private ledgerFor(ledgerKey: string): SessionLedger {
    const existing = this.ledgers.get(ledgerKey);
    if (existing !== undefined) return existing;
    const created: SessionLedger = { running: new Map(), settled: new Map() };
    this.ledgers.set(ledgerKey, created);
    return created;
  }

  private rememberSettled(ledger: SessionLedger, commandId: string, ack: CommandAck): void {
    // 重新插入以维持写入顺序；容量按合同固定为每会话 512 条。
    ledger.settled.delete(commandId);
    ledger.settled.set(commandId, ack);
    while (ledger.settled.size > SETTLED_LIMIT_PER_SESSION) {
      const oldest = ledger.settled.keys().next();
      if (oldest.done === true) break;
      ledger.settled.delete(oldest.value);
    }
  }
}

/** 会话 key：null（全局桶）与任意字符串互不冲突。 */
function sessionKeyOf(sessionId: string | null): string {
  return JSON.stringify([sessionId]);
}

/** 组装执行终态 ACK；键序由 buildCommandAck 统一决定。 */
function outcomeAck(
  commandId: string,
  status: CommandAck["status"],
  revisionAtDecision: number,
  detail: Pick<CommandAck, "reasonCode" | "message" | "result"> = {},
): CommandAck {
  return buildCommandAck({ commandId, status, revisionAtDecision, ...detail });
}

/** 执行层抛错时保留可识别的业务 reasonCode，不把结构化错误压成字符串。 */
function reasonCodeOf(error: unknown): string {
  const candidate = (error as { reasonCode?: unknown } | null | undefined)?.reasonCode;
  if (typeof candidate === "string" && candidate !== "") return candidate;
  return "fault.command.executionFailed";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
