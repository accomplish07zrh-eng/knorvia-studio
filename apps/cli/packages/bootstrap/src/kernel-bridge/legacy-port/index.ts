// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02/03：legacy 执行端口的接线（C2，kernel-switch 准入项）。
//
// 放在 `legacy-port/` **目录**下而不是 `legacy-port.ts`：legacy 自己的实现在
// `kernel-bridge/legacy/**`（`kernel-bridge-legacy` 包）。两个名字只差一个连字符时
// 审查很容易看混；用目录形式让「02/03 的端口适配器」在文件树里一眼可分。
//
// 依赖方向固定：**kernel-bridge-02/03 → kernel-bridge-legacy**（legacy 合同的
// interface.md §四 明写「本包不得 import kernel-bridge-02/03」）。因此这里
// 只按 legacy 冻结面的**形状**声明类型，由组合根在启动期调用
// `registerLegacyExecutionPort` 完成注册。
//
// **C2 的完整分母是 12**（`kernel-bridge-legacy` 的 `PORT_BACKED_METHODS`）：
// kernel-bridge-02 交付前 4 个，kernel-bridge-03 补齐其余 8 个
// （含 `session/close`——它曾被人工清单两次漏计）。

import { type KernelTurnExecutor, TurnSessionUnavailableError } from "../turn-executor.js";

/**
 * legacy 执行端口收到的请求（与 `kernel-bridge-legacy/interface.md` §四 的
 * `LegacyExecutionRequest` 逐字一致；此处复述是为了保持依赖单向与零运行期耦合）。
 */
export interface LegacyExecutionRequest {
  readonly method: string;
  readonly params: unknown;
  /** 调用方 trace（客户端 request.trace 原样透传）。 */
  readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * 旧协议方法的执行结果（与 legacy interface.md §四 的 `LegacyMethodOutcome` 一致）。
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

/** 能力缺席：既有错误码族里的 -32031（legacy behavior B10 的临时态）。 */
const CAPABILITY_UNSUPPORTED_CODE = -32031;

/** 会话不存在：既有错误码族里的 -32004。 */
const SESSION_NOT_FOUND_CODE = -32004;

/** 参数不合法：既有错误码族里的 -32602。 */
const INVALID_PARAMS_CODE = -32602;

/** 执行器上可被旧协议方法调到的方法名。 */
type ExecutorMethod =
  | "sendText"
  | "stop"
  | "compact"
  | "resumeSession"
  | "subscribeSession"
  | "forkSession"
  | "setGoal"
  | "setModel"
  | "setThoughtLevel"
  | "setMode"
  | "closeSession";

/** 一条旧协议方法 → 执行形态。 */
interface HandledMethodShape {
  /** 旧协议 payload 里字段名的候选表；第一个命中的作为 sessionId。 */
  readonly sessionIdFields: readonly string[];
  /** 需要正文的方法（`session/send`、`session/goal`）的字段候选。 */
  readonly textFields?: readonly string[];
  /** 是否需要把 `expectedForegroundExecutionId` 透传下去（过期 Stop 判定用）。 */
  readonly forwardsExpectedExecution?: boolean;
  /** 执行器上要调的方法名。 */
  readonly executorMethod: ExecutorMethod;
}

/**
 * ★ **C2 的唯一事实来源**：12 个旧协议方法 → 执行形态。
 *
 * 行集合必须与 `kernel-bridge-legacy` 的 `PORT_BACKED_METHODS` **完全一致**；
 * `fixture-integrity.test.mjs` 直接从源头抽取集合比对，不靠人工清单
 * （`session/close` 已被人工清单两次漏掉）。
 */
const HANDLED_METHODS: ReadonlyMap<string, HandledMethodShape> = new Map([
  // ── kernel-bridge-02 交付的 4 个 ──
  [
    "session/send",
    {
      sessionIdFields: ["sessionId"],
      textFields: ["text", "content"],
      executorMethod: "sendText",
    },
  ],
  [
    "session/stop",
    {
      sessionIdFields: ["sessionId"],
      forwardsExpectedExecution: true,
      executorMethod: "stop",
    },
  ],
  [
    // 后台任务取消复用同一条 stop 语义：取消的是「正在跑的回合内后台任务」，
    // 不是杀进程（安全口径）。父会话字段是它的既有 payload 变体。
    "session/cancelBackgroundTask",
    { sessionIdFields: ["sessionId", "parentSessionId"], executorMethod: "stop" },
  ],
  ["session/compact", { sessionIdFields: ["sessionId"], executorMethod: "compact" }],

  // ── kernel-bridge-03 补齐的 8 个 ──
  ["session/resume", { sessionIdFields: ["sessionId"], executorMethod: "resumeSession" }],
  ["session/subscribe", { sessionIdFields: ["sessionId"], executorMethod: "subscribeSession" }],
  ["session/fork", { sessionIdFields: ["sessionId"], executorMethod: "forkSession" }],
  [
    "session/goal",
    {
      sessionIdFields: ["sessionId"],
      textFields: ["text", "objective"],
      executorMethod: "setGoal",
    },
  ],
  ["session/setModel", { sessionIdFields: ["sessionId"], executorMethod: "setModel" }],
  [
    "session/setThoughtLevel",
    { sessionIdFields: ["sessionId"], executorMethod: "setThoughtLevel" },
  ],
  ["session/setMode", { sessionIdFields: ["sessionId"], executorMethod: "setMode" }],
  [
    // ★ 关闭会话：**语义与 `session/stop` 不同**——stop 只停当前回合、会话仍可继续；
    // close 是结束会话并释放它在 DSH 侧的 agent（不可继续）。
    // 见 03 合同 design.md §六：不得照 stop 抄一份。
    "session/close",
    { sessionIdFields: ["sessionId"], executorMethod: "closeSession" },
  ],
]);

/**
 * 造一个 legacy 执行端口：把 12 个旧协议方法转给**同一个** `KernelTurnExecutor`，
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
        // 方法不在冻结表里：C2 完成后表已覆盖全部 12 个，这条只处理协议违例。
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
  const method = shape.executorMethod;
  if (method === "sendText") {
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
  if (method === "compact") {
    // 旧协议没有 v4 commandId，因此不传 sourceCommandId（02 的 known-differences D23）。
    const result = await executor.compact({ sessionId, ...traceField });
    return successOutcome(result);
  }
  if (method === "stop") {
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
  // 其余 8 个方法走执行器的可选成员：缺席时按能力缺席，**不伪造成功**。
  const optional = executor[method];
  if (optional === undefined) return unsupportedMethodOutcome(request.method);
  const params = (request.params ?? {}) as Readonly<Record<string, unknown>>;
  const result = await optional.call(executor, { sessionId, params, ...traceField });
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

/** legacy 的形状只有「result / error」两种，集中一处构造保证错误码与文案只有一份。 */
function failureOutcome(code: number, message: string): LegacyMethodOutcome {
  return { kind: "error", code, message };
}

/** 「能力缺席」：方法不在表里，或执行器没有对应的可选成员。 */
function unsupportedMethodOutcome(method: string): LegacyMethodOutcome {
  return failureOutcome(
    CAPABILITY_UNSUPPORTED_CODE,
    `kernel-bridge-03 does not implement ${method} yet`,
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
