// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02：legacy 执行端口的接线（C2，kernel-switch 准入项）。
//
// 放在 `legacy-port/` **目录**下而不是 `legacy-port.ts`：legacy 自己的实现会在
// `kernel-bridge/legacy/**`（`kernel-bridge-legacy` 包）。两个名字只差一个连字符时
// 审查很容易看混；用目录形式让「02 的端口适配器」在文件树里一眼可分。
//
// 依赖方向固定：**kernel-bridge-02 → kernel-bridge-legacy**（legacy 合同的
// interface.md §四 明写「本包不得 import kernel-bridge-02/03」）。因此这里
// 只按 legacy 冻结面的**形状**声明类型，由组合根在启动期调用
// `registerLegacyExecutionPort` 完成注册（注册动作依赖 legacy 实现存在）。
//
// 本包交付 4 个回合类旧协议方法；其余 7 个归 kernel-bridge-03，本端口对它们返回
// capability 缺席（合同 acceptance.md §4.6「C2 部分满足 4/11」）。

import { type KernelTurnExecutor, TurnSessionUnavailableError } from "../turn-executor.js";

/**
 * legacy 执行端口收到的请求（与 `kernel-bridge-legacy/interface.md` §四 的
 * `LegacyExecutionRequest` 逐字一致；此处复述是为了在本包内保持依赖单向与
 * 零运行期耦合，签名核对见 design.md §8.1）。
 */
export interface LegacyExecutionRequest {
  readonly method: string;
  readonly params: unknown;
  /** 调用方 trace（客户端 request.trace 原样透传）。 */
  readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * 旧协议方法的执行结果（与 legacy interface.md §四 的 `LegacyMethodOutcome` 一致）。
 * 内部的 `data` 承载错误附加信息。
 */
export type LegacyMethodOutcome =
  | { readonly kind: "result"; readonly result: unknown }
  | {
      readonly kind: "error";
      /** 既有错误码族；不得新增。 */
      readonly code: number;
      readonly message: string;
      readonly data?: unknown;
    };

/** legacy 端口面：本包实现它，交给 legacy 的注册函数（其 interface.md §四）。 */
export interface LegacyExecutionPort {
  execute(request: LegacyExecutionRequest): Promise<LegacyMethodOutcome>;
}

/** 能力缺席的错误码：既有错误码族里的 -32031（legacy behavior B10 的临时态）。 */
const CAPABILITY_UNSUPPORTED_CODE = -32031;

/** 会话不存在：既有错误码族里的 -32004。 */
const SESSION_NOT_FOUND_CODE = -32004;

/** 参数不合法：既有错误码族里的 -32602。 */
const INVALID_PARAMS_CODE = -32602;

/**
 * 本包交付的旧协议方法 → 执行形态。
 *
 * 用一张表而不是四条独立分支：审查时要能一眼看出「02 到底接管了哪几个方法」，
 * 而新增一个方法也必须在这里显式加一行（不会因为漏写 switch 分支而静默缺席）。
 */
type Delivery = "queue" | "inherit";

interface HandledMethodShape {
  /** 旧协议 payload 里字段名的候选表；第一个命中的作为 sessionId。 */
  readonly sessionIdFields: readonly string[];
  /** 需要的正文来源（`session/send` 才有）。 */
  readonly textFields?: readonly string[];
  /** 投递意愿：旧协议都是排队语义；`inherit` 表示由 executor 的默认值决定。 */
  readonly delivery: Delivery;
  /** 是否需要把 `expectedForegroundExecutionId` 透传下去（过期 Stop 判定用）。 */
  readonly forwardsExpectedExecution?: boolean;
}

/** 4 个方法的形状表。键就是旧协议方法名（冻结面字面量）。 */
const HANDLED_METHODS: ReadonlyMap<string, HandledMethodShape> = new Map([
  [
    "session/send",
    {
      sessionIdFields: ["sessionId"],
      textFields: ["text", "content"],
      delivery: "queue",
    },
  ],
  [
    "session/stop",
    { sessionIdFields: ["sessionId"], delivery: "queue", forwardsExpectedExecution: true },
  ],
  [
    // 后台任务取消复用同一条 stop 语义：取消的是「正在跑的回合内后台任务」，
    // 不是杀进程（安全口径）。父会话字段是它的既有 payload 变体。
    "session/cancelBackgroundTask",
    { sessionIdFields: ["sessionId", "parentSessionId"], delivery: "queue" },
  ],
  ["session/compact", { sessionIdFields: ["sessionId"], delivery: "queue" }],
]);

/**
 * 造一个 legacy 执行端口：把 4 个旧协议回合方法转给**同一个** `KernelTurnExecutor`，
 * 与 v4 命令路径共用实现（C2 的实质要求）。
 *
 * @param executor - 已经建好的回合执行器（与 v4 路径同一个实例）。
 * @returns 可直接交给 legacy 注册函数的端口。
 */
export function createLegacyTurnPort(executor: KernelTurnExecutor): LegacyExecutionPort {
  return {
    async execute(request: LegacyExecutionRequest): Promise<LegacyMethodOutcome> {
      const shape = HANDLED_METHODS.get(request.method);
      if (shape === undefined) {
        // 归 kernel-bridge-03 的 7 个方法走这里：capability 缺席是 legacy 合同
        // behavior B10 明文允许的临时态，不得伪造成功。
        return unsupportedMethodOutcome(request.method);
      }
      const sessionId = firstStringField(request.params, shape.sessionIdFields);
      if (sessionId === undefined) {
        return missingFieldOutcome(request.method, shape.sessionIdFields[0]);
      }
      try {
        return await dispatch(executor, request, shape, sessionId);
      } catch (error) {
        if (error instanceof TurnSessionUnavailableError) {
          return inactiveSessionOutcome(error.sessionId);
        }
        // 其它异常按 legacy 约定抛出，由桥折叠为 -32603。
        throw error;
      }
    },
  };
}

/**
 * 按方法把请求交给执行器。
 *
 * @param executor - 回合执行器（与 v4 共用）。
 * @param request - legacy 请求。
 * @param shape - 该方法的形状。
 * @param sessionId - 已解析出的会话 id。
 * @returns 执行结果包装成 legacy outcome。
 */
async function dispatch(
  executor: KernelTurnExecutor,
  request: LegacyExecutionRequest,
  shape: HandledMethodShape,
  sessionId: string,
): Promise<LegacyMethodOutcome> {
  const traceField = request.trace === undefined ? {} : { trace: request.trace };
  if (request.method === "session/send") {
    const text = firstStringField(request.params, shape.textFields ?? []);
    if (text === undefined) return missingFieldOutcome(request.method, "text");
    const result = await executor.sendText({
      sessionId,
      text,
      requestedDelivery: "queue",
      ...traceField,
    });
    return successOutcome(result);
  }
  if (request.method === "session/compact") {
    // 旧协议没有 v4 commandId，因此不传 sourceCommandId（known-differences D23）。
    const result = await executor.compact({ sessionId, ...traceField });
    return successOutcome(result);
  }
  // session/stop 与 session/cancelBackgroundTask 都走同一条 stop。
  const expected = shape.forwardsExpectedExecution
    ? firstStringField(request.params, ["expectedForegroundExecutionId"])
    : undefined;
  const result = await executor.stop({
    sessionId,
    ...(expected === undefined ? {} : { expectedForegroundExecutionId: expected }),
    ...traceField,
  });
  return successOutcome(result);
}

/**
 * 按候选表读第一个存在的字符串字段。
 *
 * @param params - 旧协议参数。
 * @param fields - 候选字段名（按优先级）。
 * @returns 第一个命中的字符串值；都不命中或参数不是对象时为 undefined。
 */
function firstStringField(params: unknown, fields: readonly string[]): string | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const bag = params as Record<string, unknown>;
  for (const field of fields) {
    const candidate = bag[field];
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

/**
 * 三条错误 outcome 与一条成功 outcome 都经同一组工厂：legacy 的形状只有
 * 「result / error」两种，集中一处构造保证错误码与文案结构只有一份
 * （-32031 / -32602 / -32004）。
 */
function failureOutcome(code: number, message: string): LegacyMethodOutcome {
  return { kind: "error", code, message };
}

/** 「能力缺席」：归 kernel-bridge-03 的 7 个方法。 */
function unsupportedMethodOutcome(method: string): LegacyMethodOutcome {
  return failureOutcome(
    CAPABILITY_UNSUPPORTED_CODE,
    `kernel-bridge-02 does not implement ${method} yet`,
  );
}

/** 「参数不合法」：必填字段缺失（文案结构与既有 -32602 一致）。 */
function missingFieldOutcome(method: string, field: string): LegacyMethodOutcome {
  return failureOutcome(INVALID_PARAMS_CODE, `${method} requires ${field}`);
}

/** 「会话不活跃」：执行器报该会话没有活动 Agent。 */
function inactiveSessionOutcome(sessionId: string): LegacyMethodOutcome {
  return failureOutcome(SESSION_NOT_FOUND_CODE, `Session is not active: ${sessionId}`);
}

/** 把执行器的返回值包成 legacy 成功 outcome。 */
function successOutcome(result: unknown): LegacyMethodOutcome {
  const outcome: LegacyMethodOutcome = { kind: "result", result };
  return outcome;
}
