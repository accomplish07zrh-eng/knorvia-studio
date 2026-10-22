// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：DSH 插件入口（组合行 `moduleId` 指向本模块）。
//
// 契约依据：specs/contracts/kernel-plugin-policy/{README,interface,behavior}.md
//           README §一 3 / §二 f-h、interface.md §一、behavior.md B1 / B4 / B7 / B9
//
// 挂载形态（照 #254 `kernel-plugin-credentials` 的模板）：
//   `apply(ctx, config)` 里注册一个 `tools/pre-execute` 监听者，
//   对每个工具调用给出终局 `PreToolDecision`。
//
// **引擎无关（L10）**：本包不读 `KNORVIA_KERNEL_ENGINE`。
// 引擎分流在进程级入口 `apps/cli/packages/cli/src/run.ts:255`
// （`resolveKernelEngine(env) === "dsh"` 才动态 import `@knorvia/bootstrap/kernel`），
// 所以 legacy 路径根本不会加载本模块。
//
// **瀑布序列（Lead 2026-10-22 裁决）**：
//   ① 模式快照（缺失 → deny，fail closed）
//   ② signal 已中止 → cancel
//   ③ 硬约束（control / interaction / mandatory）命中 → **直接返回，不调 next()**
//      ← 产品级硬约束，下游 Hook 无权推翻
//   ④ 会话授权命中 → allow，**不调 next()**
//      ← 已授权的调用不需要再问 Hook
//   ⑤ 调 next() → 下游（kernel-plugin-hooks）参与
//      下游返回非 allow → 尊重它（Hook 有权收紧）
//   ⑥ 下游放行后，应用软约束（ordinary / plan / exemptions / build）

import type { Context } from "@deepseek-ai/cordis";
// 只为拿到 `tools/pre-execute` 的 Context 事件类型增强（该包用 declare module 扩充 Events）。
// 与 `kernel/runtime-context.ts` 引入 `dsh-system-prompt` 的做法一致：类型侧引入，运行时不加载。
import type {} from "@deepseek-ai/dsh-tools";
import { NOOP_LOGGER, type KnorviaLogger } from "./logger.js";
import { createModeRegistry, type CollaborationMode, type ModeRegistry } from "./mode-registry.js";
import {
  createSessionGrantStore,
  type SessionGrant,
  type SessionGrantStore,
} from "./session-grants.js";
import { createToolCatalogue, type ToolCatalogue } from "./tool-catalogue.js";
import type { ToolCapabilityDeclaration } from "./capability-resolver.js";
import {
  cancelledDecision,
  evaluateHardRoutes,
  evaluateSoftRoutes,
  routeExhausted,
  type PathModule,
  type PolicySessionConfig,
  type RouteDecision,
} from "./policy-routes.js";

/** 组合行 id。组合根用它把本插件写进 DSH 组合。 */
export const DEFAULT_POLICY_ROW_ID = "knorvia-policy";

/**
 * DSH 侧 `PreToolDecision` 的最小形状。
 *
 * 本包不 import DSH 的该类型，原因：本模块要能被纯离线测试装配（不加载 DSH 运行时）。
 * 形状与 `@deepseek-ai/dsh-tools` 的 `PreToolDecision` 一致（四档 `kind`）。
 */
export type PreToolDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "cancel" }
  | {
      readonly kind: "ask";
      readonly reason?: string;
      readonly displayReason?: { readonly en: string; readonly [locale: string]: string };
    };

/** 本包从 `ToolExecution` 用到的最小字段集。 */
export interface ToolExecutionLike {
  readonly callId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly agent?: { readonly id: string };
  readonly signal?: AbortSignal;
}

/** 插件配置。三个必需 getter 缺席 → `apply` 立即抛错（B1）。 */
export interface KnorviaPolicyConfig {
  /**
   * 读当前 session 的协作模式。**必需**。
   *
   * 接线：组合根把它接到「UI / session log 的权威模式状态」。
   * **不要**在这里读 `dsh-plan-mode` 的 `active` —— 那只有布尔，无法区分 build/edit/yolo/auto
   * （README §二 a）。
   */
  readonly readMode: (sessionId: string) => CollaborationMode | undefined;
  /**
   * 读工具能力声明。**必需**。返回 `undefined` 表示该工具无声明（走工具名缺省表）。
   *
   * 接线：工具插件（`kernel-plugin-tools-01`）注册声明，组合根提供查询。
   */
  readonly readToolCapability: (toolName: string) => ToolCapabilityDeclaration | undefined;
  /**
   * 读当前 session 的已授权规则集。**必需**。返回 `undefined` 等同于空集。
   *
   * 接线：组合根在用户选「本次会话都允许」时写入；也可由本包的 `grantSessionPermission` 写。
   */
  readonly readSessionGrants: (sessionId: string) => readonly SessionGrant[] | undefined;
  /** 读项目权限规则集（可选）。缺席时项目规则判定按「无规则」处理。 */
  readonly readProjectRules?: (sessionId: string) => unknown;
  /** 读会话工作目录（可选）。缺席时草稿免确认不生效（B12）。 */
  readonly readWorkingDirectory?: (sessionId: string) => string | undefined;
  /** 读会话级权限配置（可选）。对应旧实现的 `PermissionConfig`（K4）。 */
  readonly readSessionConfig?: (sessionId: string) => PolicySessionConfig | undefined;
  /** 注入 path 实现（测试用；生产用 `node:path`）。 */
  readonly pathModule?: PathModule;
  readonly logger?: KnorviaLogger;
}

/** `apply` 的返回值：暴露注册表与授权存储，供组合根在运行期写入。 */
export interface PolicyPluginHandle {
  readonly rowId: string;
  readonly modes: ModeRegistry;
  readonly grants: SessionGrantStore;
  readonly catalogue: ToolCatalogue;
  /** 记录模式变更（组合根在 UI 切模式 / `/plan` 命令时调用）。 */
  setMode(sessionId: string, mode: CollaborationMode): void;
  /** 在用户选「本次会话都允许」后追加授权。**不要在 pre-execute 内调用**（L8）。 */
  grantSessionPermission(sessionId: string, grant: SessionGrant): void;
  /** session 结束时清理（避免内存增长）。 */
  forgetSession(sessionId: string): void;
}

/**
 * DSH 插件入口。
 *
 * @throws 缺少必需接线字段时**立即抛错** —— 配置错误应在装配期暴露，
 *   而不是拖到第一次工具调用（那时症状在工具执行上，根因却在装配）。
 */
export function apply(ctx: Context, config: KnorviaPolicyConfig): PolicyPluginHandle {
  const logger = config.logger ?? NOOP_LOGGER;

  // 早失败（B1）：不补默认值 —— 三个字段都是「当前运行时的事实」，
  // 凭空造 mode 等于伪造状态（会让新 session 意外获得某个模式的权限）。
  assertWired(config);

  const modes = createModeRegistry({ readMode: config.readMode });
  const grants = createSessionGrantStore({ readSessionGrants: config.readSessionGrants });
  const catalogue = createToolCatalogue({ readToolCapability: config.readToolCapability });

  logger.info("kernel.policy.mounted", {
    rowId: DEFAULT_POLICY_ROW_ID,
    // 只记「接线是否齐备」，不记任何 session 或工具实参。
    hasProjectRules: typeof config.readProjectRules === "function",
    hasWorkingDirectory: typeof config.readWorkingDirectory === "function",
    hasSessionConfig: typeof config.readSessionConfig === "function",
  });

  const handle: PolicyPluginHandle = {
    rowId: DEFAULT_POLICY_ROW_ID,
    modes,
    grants,
    catalogue,
    setMode(sessionId, mode) {
      modes.record(sessionId, mode, "composition-root");
      logger.debug("kernel.policy.mode.recorded", { sessionId, mode });
    },
    grantSessionPermission(sessionId, grant) {
      grants.add(sessionId, grant);
      logger.info("kernel.policy.grant.added", {
        sessionId,
        toolName: grant.toolName,
        hasRuleContent: grant.ruleContent !== undefined,
      });
    },
    forgetSession(sessionId) {
      modes.forget(sessionId);
      grants.clear(sessionId);
      logger.info("kernel.policy.session.forgotten", { sessionId });
    },
  };

  // 注册监听者。**这是本包唯一的运行时入口**。
  ctx.on(
    "tools/pre-execute",
    async (exec: ToolExecutionLike, next: () => Promise<PreToolDecision>) => {
      return decide(exec, next, { config, modes, grants, catalogue, logger });
    },
  );

  return handle;
}

/** 一次判定的全部依赖。 */
interface DecideContext {
  readonly config: KnorviaPolicyConfig;
  readonly modes: ModeRegistry;
  readonly grants: SessionGrantStore;
  readonly catalogue: ToolCatalogue;
  readonly logger: KnorviaLogger;
}

/**
 * 单次判定的瀑布序列（见文件头注释）。
 *
 * **不抛错**：任何内部异常都在这里 catch 成 `deny`（B9/L5）——
 * DSH 侧异常可能导致管线失败并走默认放行，那会违反 fail closed。
 */
async function decide(
  exec: ToolExecutionLike,
  next: () => Promise<PreToolDecision>,
  deps: DecideContext,
): Promise<PreToolDecision> {
  const { config, modes, grants, catalogue, logger } = deps;
  const sessionId = exec.agent?.id;

  try {
    // ① 模式快照（B4/L2）：入口捕获一次，全程只用它。
    //    下游 Hook 即使改了注册表，本次判定也不受影响。
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return failClosed(logger, exec, "missing-session", "no agent session on this execution");
    }
    const modeAtEntry = modes.resolve(sessionId);
    if (modeAtEntry === undefined) {
      // L3：模式缺失 → deny，**不默认 build**。
      return failClosed(
        logger,
        exec,
        "missing-mode",
        "no collaboration mode recorded for this session",
      );
    }

    // ② signal 已中止 → cancel（B7）。**不用 deny**：取消不是拒绝语义。
    if (exec.signal?.aborted === true) {
      logger.debug("kernel.policy.cancelled", { callId: exec.callId, toolName: exec.name });
      return toPreToolDecision(cancelledDecision());
    }

    // 组装判定事实。getter 形式保证惰性（K2）：只有被选中的路线才会读到规则与授权。
    const capability = catalogue.resolve(exec.name);
    const sessionConfig = config.readSessionConfig?.(sessionId);
    const workingDirectory = config.readWorkingDirectory?.(sessionId);
    const facts = {
      mode: modeAtEntry,
      toolName: exec.name,
      arguments: exec.arguments,
      capability,
      sessionId,
      readSessionGrants: () =>
        grants.matches(sessionId, { toolName: exec.name, arguments: exec.arguments }),
      readProjectRules: () => {
        const raw = config.readProjectRules?.(sessionId);
        return raw === undefined || raw === null ? undefined : (raw as never);
      },
      workingDirectory,
      pathModule: config.pathModule,
      config: sessionConfig,
    };

    // ③ 硬约束（control / interaction / mandatory）→ 命中即短路，**不调 next()**。
    const hard = evaluateHardRoutes(facts);
    if (hard !== undefined) {
      logger.debug("kernel.policy.decision.hard", {
        callId: exec.callId,
        toolName: exec.name,
        mode: modeAtEntry,
        ruleId: hard.ruleId,
        decision: hard.kind,
      });
      return toPreToolDecision(hard);
    }

    // ④ 会话授权命中 → allow，不调 next()。已授权的调用不必再问下游 Hook。
    if (grants.matches(sessionId, { toolName: exec.name, arguments: exec.arguments })) {
      logger.debug("kernel.policy.decision.grant", {
        callId: exec.callId,
        toolName: exec.name,
        mode: modeAtEntry,
      });
      return { kind: "allow" };
    }

    // ⑤ 交给下游（`kernel-plugin-hooks`）。
    //    ⚠️ 这是「hooks 后判」的实现：硬约束已经短路，软约束在下游放行后叠加。
    const downstream = await next();
    if (downstream.kind !== "allow") {
      // 下游有权收紧（deny / ask / cancel）→ 尊重它，不再叠加软约束。
      logger.debug("kernel.policy.decision.downstream", {
        callId: exec.callId,
        toolName: exec.name,
        downstreamKind: downstream.kind,
      });
      return downstream;
    }

    // ⑥ 下游放行后应用软约束（ordinary / plan / exemptions / build）。
    const soft = evaluateSoftRoutes(facts);
    logger.debug("kernel.policy.decision.soft", {
      callId: exec.callId,
      toolName: exec.name,
      mode: modeAtEntry,
      ruleId: soft.ruleId,
      decision: soft.kind,
    });
    const applied = soft ?? routeExhausted();
    // 软约束给出 allow 时采纳；给出 ask/deny 时以它为准（产品策略优先于 Hook 的放行）。
    return toPreToolDecision(applied);
  } catch (error) {
    // ⑦ 兜底（B9/L5）：内部异常 → deny，**不 rethrow**。
    //    脱敏：只记 message 与 stack 首行，不记任何实参值（B11/L9）。
    logger.error("kernel.policy.internalError", {
      callId: exec.callId,
      toolName: exec.name,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? "").split("\n")[0] : undefined,
    });
    return { kind: "deny", reason: "Permission policy failed; denying by default" };
  }
}

/** fail closed：统一记录 `warn` 并返回 `deny`（B9）。 */
function failClosed(
  logger: KnorviaLogger,
  exec: ToolExecutionLike,
  reasonKind: string,
  reason: string,
): PreToolDecision {
  logger.warn("kernel.policy.failClosed", {
    callId: exec.callId,
    toolName: exec.name,
    reasonKind,
  });
  return { kind: "deny", reason };
}

/**
 * 把内部 `RouteDecision` 转成 DSH 的 `PreToolDecision`。
 *
 * `ruleId` **不进** DSH 的决策对象（它只接受四档 `kind` + `reason`），
 * 所以诊断靠日志，不靠返回值的形状。
 */
function toPreToolDecision(decision: RouteDecision): PreToolDecision {
  switch (decision.kind) {
    case "allow":
      return { kind: "allow" };
    case "deny":
      return { kind: "deny", reason: decision.reason };
    case "cancel":
      return { kind: "cancel" };
    case "ask":
      return decision.displayReason === undefined
        ? { kind: "ask", reason: decision.reason }
        : { kind: "ask", reason: decision.reason, displayReason: decision.displayReason };
  }
}

/**
 * 装配期校验（B1）：三个必需 getter 缺席即抛错。
 *
 * 集中一处的好处：错误消息能直接指出**缺了哪个字段**，而不是让症状出现在
 * 第一次工具调用上（那时看到的是「判定异常」，根因却是装配期少传了一个 getter）。
 */
export function assertWired(config: KnorviaPolicyConfig): void {
  if (typeof config.readMode !== "function") {
    throw new Error(
      "kernel-plugin-policy: config.readMode is required " +
        "(the composition root must supply the authoritative collaboration mode reader)",
    );
  }
  if (typeof config.readToolCapability !== "function") {
    throw new Error(
      "kernel-plugin-policy: config.readToolCapability is required " +
        "(tool plugins register capability declarations; the composition root provides the lookup)",
    );
  }
  if (typeof config.readSessionGrants !== "function") {
    throw new Error(
      "kernel-plugin-policy: config.readSessionGrants is required " +
        "(the composition root must supply the current session grant reader)",
    );
  }
}

export { createModeRegistry, createSessionGrantStore, createToolCatalogue };
export { NOOP_LOGGER } from "./logger.js";
export { detectCatalogueDrift, knownToolNames } from "./tool-catalogue.js";
export {
  POLICY_ROUTE_ORDER,
  evaluateHardRoutes,
  evaluateSoftRoutes,
  routeExhausted,
  cancelledDecision,
} from "./policy-routes.js";
export { resolveCapability, resolveRiskLevel, NAME_DEFAULTS } from "./capability-resolver.js";
export type {
  ResolvedCapability,
  ToolCapabilityDeclaration,
  RiskLevel,
  SideEffectScope,
} from "./capability-resolver.js";
export type { SessionGrant, SessionGrantStore } from "./session-grants.js";
export type { ModeRegistry, ModeSource } from "./mode-registry.js";
export type {
  ToolCatalogue,
  ToolMetadata,
  MetadataSource,
  CatalogueDrift,
} from "./tool-catalogue.js";
export type { KnorviaLogger } from "./logger.js";
export type {
  PolicyFacts,
  RouteDecision,
  LocalizedText,
  PathModule,
  PolicySessionConfig,
} from "./policy-routes.js";
