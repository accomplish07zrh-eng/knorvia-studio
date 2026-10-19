// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01 段 A：v4/command admission 与 v4/commands/query（合同 interface.md 第四节）
//
// 三类事实严格分离，和旧运行时同语义：
//   in-flight  —— 正在执行；同 key 的重试等这个 key 的终态，而不是重新裁决；
//   settled    —— 执行终态或 noop；只有这两类进入 LRU，拒绝与 stale 不缓存（重试重新裁决）；
//   live input —— 本包不产生（DSH 输入立即执行），保留查询分支以保持层数一致。
//
// 裁决顺序固定：会话存在 → CAS 字段完整性 → logEpoch → revision → 行定位/守卫。
// 顺序即契约，不得按“先便宜后昂贵”重排：baseLogEpoch 必须比 baseRevision 先裁决。

import { PROTOCOL_V4_LIMITS, type CommandAck, type CommandEnvelope } from "@knorvia/shared/protocol-v4";
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
  targetsRows,
} from "./command-envelope.js";
import type { BridgeEventProjectionLayer, BridgeSessionState } from "./interface.js";

/** 全局幂等桶的键；createSession 与 sessionId=null 的 query 都落这里。 */
const GLOBAL_BUCKET = "@global";

/** 单会话 settled 缓存上限（与旧运行时一致：512/session，超出按插入序淘汰）。 */
const SETTLED_CAPACITY = PROTOCOL_V4_LIMITS.idempotencyTablePerSession;

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

interface InFlightEntry {
  readonly ack: CommandAck;
  readonly final: Promise<CommandAck>;
  readonly resolveFinal: (ack: CommandAck) => void;
}

interface SettledBucket {
  readonly entries: Map<string, CommandAck>;
}

/**
 * 命令准入 + 幂等缓存。
 *
 * 该类不持有投影层状态：CAS 判定所需的 revision/logEpoch 每次从投影层现读，
 * 避免桥内出现第二份 revision 事实源。
 */
export class BridgeCommandInbox {
  private readonly inFlight = new Map<string, Map<string, InFlightEntry>>();
  private readonly settled = new Map<string, SettledBucket>();

  constructor(
    private readonly projection: BridgeEventProjectionLayer,
    private readonly executor: BridgeCommandExecutor,
  ) {}

  /** 处理 v4/command：任何输入都收敛为一条 ACK，从不抛协议错误（合同 §3）。 */
  async handle(raw: unknown): Promise<CommandAck> {
    const parsed = parseBridgeCommandEnvelope(raw);
    if (!parsed.ok) {
      return invalidPayloadAck(peekCommandId(raw), { message: parsed.message });
    }
    const envelope = parsed.envelope;
    const bucket = this.bucketKey(envelope.sessionId);

    const pinned = this.inFlight.get(bucket)?.get(envelope.commandId);
    if (pinned) return this.duplicate(await pinned.final);

    const cached = this.lookupSettled(bucket, envelope.commandId);
    if (cached) return this.duplicate(cached);

    const decision = this.decide(envelope);
    if (decision.kind === "ack") {
      // 拒绝/stale 不入 settled：同一个 commandId 重试必须重新裁决。
      return decision.ack;
    }

    return await this.execute(envelope, bucket, decision.revisionAtDecision);
  }

  /** 处理 v4/commands/query：已 settled 的 key 一律回缓存 ACK，不得回退 unknown。 */
  query(raw: unknown): ReturnType<typeof buildCommandsQueryResult> | undefined {
    const params = parseBridgeCommandsQuery(raw);
    if (!params) return undefined;
    return buildCommandsQueryResult(params, (sessionId, commandId) =>
      this.lookupSettled(this.bucketKey(sessionId), commandId),
    );
  }

  /** 会话销毁时清掉它的幂等缓存；in-flight 由执行完成自然收敛，不在此处理。 */
  forgetSession(sessionId: string): void {
    this.settled.delete(sessionId);
    this.inFlight.delete(sessionId);
  }

  private async execute(
    envelope: CommandEnvelope,
    bucket: string,
    revisionAtDecision: number,
  ): Promise<CommandAck> {
    let resolveFinal!: (ack: CommandAck) => void;
    const final = new Promise<CommandAck>((resolve) => {
      resolveFinal = resolve;
    });
    const pending = buildCommandAck({
      commandId: envelope.commandId,
      status: "accepted",
      revisionAtDecision,
    });
    const entry: InFlightEntry = { ack: pending, final, resolveFinal };
    this.mapFor(this.inFlight, bucket).set(envelope.commandId, entry);

    let outcome: CommandAck;
    try {
      const executed = await this.executor.execute(envelope);
      outcome = buildCommandAck({
        commandId: envelope.commandId,
        status: executed.status,
        revisionAtDecision,
        reasonCode: executed.reasonCode,
        message: executed.message,
        result: executed.result,
      });
    } catch (error) {
      outcome = buildCommandAck({
        commandId: envelope.commandId,
        status: "failed",
        reasonCode: failureReasonCode(error),
        message: error instanceof Error ? error.message : String(error),
        revisionAtDecision,
      });
    }

    this.inFlight.get(bucket)?.delete(envelope.commandId);
    // 执行终态（含 failed）与 noop 才是 settled 事实；其余状态在这里不可达。
    this.rememberSettled(bucket, envelope.commandId, outcome);
    resolveFinal(outcome);
    return outcome;
  }

  /**
   * 纯裁决：不产生副作用、不写缓存。
   * 返回 `execute` 时携带执行前 revision（ACK 的 revisionAtDecision 语义）。
   */
  private decide(
    envelope: CommandEnvelope,
  ): { kind: "execute"; revisionAtDecision: number } | { kind: "ack"; ack: CommandAck } {
    // createSession 是全局桶命令：它的“会话存在性”由执行结果回答，不参与 sessionNotFound 判定。
    if (envelope.type === "createSession") {
      return { kind: "execute", revisionAtDecision: 0 };
    }

    const state = this.sessionState(envelope.sessionId);
    if (!state) {
      return {
        kind: "ack",
        ack: sessionNotFoundAck(envelope.commandId, envelope.sessionId ?? ""),
      };
    }

    const revision = state.revision;
    // 字段完整性：CAS 命令缺 baseRevision 属信封非法，必须早于任何状态比较。
    if (requiresBaseRevision(envelope.type) && envelope.baseRevision === undefined) {
      return {
        kind: "ack",
        ack: buildCommandAck({
          commandId: envelope.commandId,
          status: "rejected",
          reasonCode: BRIDGE_REASON_CODES.invalidPayload,
          message: `${envelope.type} requires baseRevision`,
          revisionAtDecision: revision,
        }),
      };
    }
    // 代际先于 revision：过期 epoch 的 baseRevision 比较没有意义。
    if (targetsRows(envelope.type) && envelope.baseLogEpoch !== state.logEpoch) {
      return {
        kind: "ack",
        ack: buildCommandAck({
          commandId: envelope.commandId,
          status: "stale",
          reasonCode: BRIDGE_REASON_CODES.staleLogEpoch,
          revisionAtDecision: revision,
        }),
      };
    }
    if (envelope.baseRevision !== undefined && envelope.baseRevision !== revision) {
      return {
        kind: "ack",
        ack: buildCommandAck({
          commandId: envelope.commandId,
          status: "stale",
          reasonCode: BRIDGE_REASON_CODES.staleRevision,
          revisionAtDecision: revision,
        }),
      };
    }

    return { kind: "execute", revisionAtDecision: revision };
  }

  private sessionState(sessionId: string | null): BridgeSessionState | undefined {
    if (sessionId === null) return undefined;
    return this.projection.getSessionState(sessionId);
  }

  private lookupSettled(bucket: string, commandId: string): CommandLookup {
    return this.settled.get(bucket)?.entries.get(commandId);
  }

  private rememberSettled(bucket: string, commandId: string, ack: CommandAck): void {
    let target = this.settled.get(bucket);
    if (!target) {
      target = { entries: new Map<string, CommandAck>() };
      this.settled.set(bucket, target);
    }
    // 重新插入以维持 LRU 顺序；容量按契约固定为 512/session。
    target.entries.delete(commandId);
    target.entries.set(commandId, ack);
    while (target.entries.size > SETTLED_CAPACITY) {
      const oldest = target.entries.keys().next();
      if (oldest.done === true) break;
      target.entries.delete(oldest.value);
    }
  }

  private duplicate(settled: CommandAck): CommandAck {
    return duplicateAck(settled.commandId, settled);
  }

  private bucketKey(sessionId: string | null): string {
    return sessionId ?? GLOBAL_BUCKET;
  }

  private mapFor(
    table: Map<string, Map<string, InFlightEntry>>,
    bucket: string,
  ): Map<string, InFlightEntry> {
    let map = table.get(bucket);
    if (!map) {
      map = new Map<string, InFlightEntry>();
      table.set(bucket, map);
    }
    return map;
  }
}

/** 执行层抛错时保留可识别的业务 reasonCode，避免把结构化错误压成字符串。 */
function failureReasonCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const reasonCode = (error as { reasonCode?: unknown }).reasonCode;
    if (typeof reasonCode === "string" && reasonCode !== "") return reasonCode;
  }
  return "fault.command.executionFailed";
}
