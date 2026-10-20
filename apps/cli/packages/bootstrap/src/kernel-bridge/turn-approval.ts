// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：审批交互的桥接（合同 behavior.md B9/B10）。
//
// 安全底线（B10）：**拿不到应答时必须拒绝，不能默认放行。** 因此本模块的默认行为
// 是 fail closed —— 通道缺席、超时、应答非法，一律回 `unavailable`。
//
// 反向请求通道按合同归 `kernel-bridge-legacy` 的 `LegacyHostChannel`
// （其 interface.md §四「反向请求 … 由 CLI 侧发起；桥只提供 LegacyHostChannel」）。
// 该实现尚未合并，因此这里定义**端口形状**并让"通道缺席"成为一等状态：
// 缺席 → fail closed，而不是静默放行或自建 stdout 写通道。

/** DSH 审批的三种闭合结果；只有 `allowed-once` 是授权。 */
export type TurnApprovalOutcome = "allowed-once" | "rejected" | "unavailable";

/** v4 `resolveInteraction` 的应答形状（与 `commandPayloadSchemas.resolveInteraction` 对齐）。 */
export interface TurnInteractionAnswer {
  readonly optionId?: string;
  readonly freeText?: string;
  /** `accept`/`decline`/`cancel`；存在时优先于 optionId/freeText。 */
  readonly action?: "accept" | "decline" | "cancel";
  readonly content?: Readonly<Record<string, unknown>>;
}

/**
 * 向 Host 发起一次反向交互请求的通道。
 *
 * 合同规定这必须由 `kernel-bridge-legacy` 的 `LegacyHostChannel` 提供；本模块只依赖
 * 这个最小形状，便于在没有 legacy 实现时用「通道缺席」表达 fail closed。
 */
export interface TurnInteractionChannel {
  request(
    method: string,
    params: unknown,
    resultSchema: { parse(value: unknown): TurnInteractionAnswer },
    options?: { readonly timeoutMs?: number; readonly signal?: AbortSignal },
  ): Promise<TurnInteractionAnswer>;
}

/** 一次未决的审批请求。 */
interface PendingApproval {
  readonly interactionId: string;
  readonly resolve: (outcome: TurnApprovalOutcome) => void;
}

/** 反向交互的方法名（旧协议方法名，冻结面）。 */
const PERMISSION_METHOD = "interaction/requestPermission";

/**
 * 把一次 DSH 审批请求桥成 Host 交互，并按 fail-closed 语义收敛。
 *
 * 判定顺序就是安全性顺序，不得重排：
 *   1. 通道缺席 → `unavailable`（不授权）；
 *   2. 发出请求后收到合法应答 → 按 `action` 映射；
 *   3. 应答缺失/非法/被取消 → `unavailable`。
 *
 * @param options.channel - 反向交互通道；缺席表示 Host 通道尚未接通。
 * @param options.toolName - 触发审批的工具名（只用于请求载荷，不进日志键值）。
 * @param options.toolCallId - 本次工具调用标识。
 * @param options.reason - 面向用户的审批理由。
 * @param options.signal - 回合/调用的取消信号。
 * @returns 闭合的审批结果；只有明确 accept 才是 `allowed-once`。
 */
export async function requestTurnApproval(options: {
  readonly channel?: TurnInteractionChannel;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly reason: string;
  readonly signal: AbortSignal;
}): Promise<TurnApprovalOutcome> {
  const { channel } = options;
  if (channel === undefined) {
    // Host 通道未接通：安全侧唯一正确的答案是「不批准」。
    return "unavailable";
  }
  if (options.signal.aborted) return "unavailable";
  try {
    const raw = await channel.request(
      PERMISSION_METHOD,
      {
        toolName: options.toolName,
        toolCallId: options.toolCallId,
        reason: options.reason,
      },
      { parse: parseInteractionAnswer },
      { signal: options.signal },
    );
    // 通道约定是「返回已按 resultSchema 解析的值」，但那条约定靠调用方自觉；
    // 审批层的安全底线不能建立在别人的自觉上，因此这里**自己再校验一次**。
    // 实测：跳过这一步时，一个返回 `"yes"` 的通道会被当成合法应答。
    return mapAnswerToOutcome(parseInteractionAnswer(raw));
  } catch {
    // 通道失败（断线、超时、协议错误、形状非法）一律 fail closed；
    // 不把异常继续上抛，因为审批层必须总能给出一个闭合决定。
    return "unavailable";
  }
}

/**
 * 校验并收窄 Host 的应答形状。
 *
 * @param value - 通道返回的原始值。
 * @returns 收窄后的应答。
 * @throws 当形状非法时（调用方按 fail closed 处理）。
 */
function parseInteractionAnswer(value: unknown): TurnInteractionAnswer {
  if (typeof value !== "object" || value === null) {
    throw new Error("approval answer must be an object");
  }
  const record = value as Record<string, unknown>;
  const action = record.action;
  if (action !== undefined && action !== "accept" && action !== "decline" && action !== "cancel") {
    throw new Error(`unsupported approval action: ${String(action)}`);
  }
  return {
    ...(typeof record.optionId === "string" ? { optionId: record.optionId } : {}),
    ...(typeof record.freeText === "string" ? { freeText: record.freeText } : {}),
    ...(action === "accept" || action === "decline" || action === "cancel" ? { action } : {}),
    ...(typeof record.content === "object" && record.content !== null
      ? { content: record.content as Record<string, unknown> }
      : {}),
  };
}

/**
 * 把 Host 应答映射成 DSH 的闭合结果。
 *
 * 只有**明确的 accept** 才是授权；`decline`/`cancel` 是拒绝；
 * 其余（含只有 optionId 而没有 action 的兼容路径）按「没有明确同意」处理为拒绝。
 * `cancel` 归到 `rejected` 而不是 `unavailable`：那是用户明确表态，不是通道故障。
 *
 * @param answer - 已校验的应答。
 * @returns DSH 侧闭合结果。
 */
function mapAnswerToOutcome(answer: TurnInteractionAnswer): TurnApprovalOutcome {
  if (answer.action === "accept") return "allowed-once";
  if (answer.action === "decline" || answer.action === "cancel") return "rejected";
  // 兼容路径：没有 action 时，只有 optionId 就等于「选了某项」，无法判断是否同意，
  // 因此按拒绝处理——安全侧宁可多拒，不可错放。
  return "rejected";
}

/**
 * 未决审批的登记表。它在**每个回合内**唯一：同一 `interactionId` 只生效一次
 * （B9「先到先得，晚到 noop」）。
 */
export class TurnApprovalRegistry {
  private readonly pending = new Map<string, PendingApproval>();

  /**
   * 登记一次未决请求。
   *
   * @param interactionId - 本次交互标识（v4 `resolveInteraction.interactionId`）。
   * @param resolve - 收到应答时的收敛回调。
   * @returns 注销函数；重复调用无副作用。
   */
  register(interactionId: string, resolve: (outcome: TurnApprovalOutcome) => void): () => void {
    if (this.pending.has(interactionId)) {
      throw new Error(`approval ${interactionId} is already pending`);
    }
    this.pending.set(interactionId, { interactionId, resolve });
    return () => {
      this.pending.delete(interactionId);
    };
  }

  /**
   * 用 v4 `resolveInteraction` 的应答闭合一次请求。
   *
   * @param interactionId - 要闭合的交互。
   * @param answer - 应答内容。
   * @returns 是否真的闭合了某个请求（`false` 表示已解决或不存在 → noop）。
   */
  settle(interactionId: string, answer: TurnInteractionAnswer): boolean {
    const entry = this.pending.get(interactionId);
    if (entry === undefined) return false;
    this.pending.delete(interactionId);
    entry.resolve(mapAnswerToOutcome(answer));
    return true;
  }

  /** 当前未决数量；用于诊断与断言。 */
  get size(): number {
    return this.pending.size;
  }

  /** 回合结束时把剩余未决请求全部按 fail closed 收敛。 */
  failAllPending(): void {
    for (const entry of this.pending.values()) entry.resolve("unavailable");
    this.pending.clear();
  }
}
