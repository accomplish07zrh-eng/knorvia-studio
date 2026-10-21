// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：DSH 插件入口（组合行 `moduleId` 指向本模块）。
//
// 契约依据：specs/contracts/kernel-plugin-credentials/{interface,behavior}.md §一 / B1 / B2 / B10
//
// 挂载时序（重要，2026-10-20 经源码核实）：**provider 必须在首次模型请求时已可用**。
// 保证它的是 DSH `boot()` 的语义——`dsh-app-boot` 在返回前 `await ctx.get("loader")?.await()`，
// 后者循环等到所有插件 import/生命周期任务归零；`kernel/process.ts` 随后才写就绪行、才
// `runBridge()`。**行之间的顺序不决定挂载顺序**（`cordis-plugin-loader` 用 `Promise.all` 并发挂载）。
// 因此本模块不承担「挂载顺序」责任，也不需要自己抢跑。

import type { Context } from "@deepseek-ai/cordis";
import { createKnorviaCredentialProvider } from "./provider.js";
import {
  DEFAULT_CREDENTIAL_REF_PREFIX,
  DEFAULT_CREDENTIAL_TIMEOUT_MS,
  KNORVIA_HOST_SOURCE,
  requestProviderCredentials,
} from "./credentials-request.js";
import { NOOP_LOGGER, type KnorviaLogger } from "./logger.js";
import { buildPiAiProviderTable, type KnorviaProviderEntry } from "./provider-table.js";
import type { LegacyHostChannel } from "../kernel-bridge/legacy/types.js";

/** 组合行必须传的配置。三个必需字段见 interface.md §一 接线约定。 */
export interface KnorviaCredentialsConfig {
  /**
   * 取当前反向请求通道。**必需**。
   *
   * 组合根接线：`() => bridge.channelForHostRequests()`（#239 已合并的公开访问器）。
   * 为什么是 getter：桥在 attach/detach 之间状态会变，而 `resolve()` 按请求调用（B5/D4）。
   */
  readonly hostChannel: () => LegacyHostChannel | undefined;
  /** 当前会话 / workspace / 模型选择。**必需**（反向请求 schema 的必填字段）。 */
  readonly sessionContext: () => {
    readonly sessionId: string;
    readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
    readonly modelSelection: { readonly providerId: string; readonly modelId: string };
  };
  /** Knorvia 供应商配置。**必需**（空数组合法）。 */
  readonly providers: readonly KnorviaProviderEntry[];
  /** 凭据引用名前缀。缺省 `KNORVIA_`。**不是**环境变量。 */
  readonly credentialRefPrefix?: string;
  /** 单次反向请求超时。缺省 180_000ms（既有 `provider-runtime-headers` 总时限）。 */
  readonly credentialRequestTimeoutMs?: number;
  readonly logger?: KnorviaLogger;
}

/**
 * DSH 插件入口。
 *
 * 挂载后 `ctx.credentials` 由 `KnorviaCredentialProvider` 提供——服务名 `"credentials"`
 * 由基类构造函数 `super(ctx, "credentials")` 固定，本包不自选服务名（D1）。
 *
 * @throws 缺少必需接线字段时**立即抛错**：配置错误应在装配期暴露，
 *   而不是拖到第一次模型请求（那时症状在模型调用上，根因却在装配）。
 */
export function apply(ctx: Context, config: KnorviaCredentialsConfig): void {
  const logger = config.logger ?? NOOP_LOGGER;

  // 早失败（interface.md §一）：不补默认值——三个字段都是「当前运行时的事实」，
  // 凭空造值等于伪造状态（例如伪造 sessionId）。
  assertWired(config);

  const sessionContext = config.sessionContext;
  const provider = createKnorviaCredentialProvider(
    {
      // 每次调用都重新取通道：桥可能在运行期 attach/detach（B5）。
      channel: config.hostChannel,
      get sessionId() {
        return sessionContext().sessionId;
      },
      get workspace() {
        return sessionContext().workspace;
      },
      get modelSelection() {
        return sessionContext().modelSelection;
      },
      credentialRefPrefix: config.credentialRefPrefix ?? DEFAULT_CREDENTIAL_REF_PREFIX,
      credentialRequestTimeoutMs:
        config.credentialRequestTimeoutMs ?? DEFAULT_CREDENTIAL_TIMEOUT_MS,
      logger,
    },
    ctx,
  );

  logger.info("kernel.credentials.mounted", {
    credentialRefPrefix: config.credentialRefPrefix ?? DEFAULT_CREDENTIAL_REF_PREFIX,
    providerCount: config.providers.length,
    // 只记配置摘要，不记任何凭据（S2）。
  });

  // provider 供出后，供应商表才有意义（表里引用的 `apiKeyEnv` 要能被它解析）。
  const table = buildPiAiProviderTable(config.providers, {
    credentialRefPrefix: config.credentialRefPrefix ?? DEFAULT_CREDENTIAL_REF_PREFIX,
    logger,
  });
  logger.info("kernel.credentials.provider-table.built", {
    routes: Object.keys(table),
  });

  // provider 已被 `ctx` 持有（基类构造即注册），此引用仅为可读性。
  void provider;
}

/** `provider/testModelConnectivity` 的入参（B10）。 */
export interface ProviderConnectivityInput {
  readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
  readonly selection: { readonly providerId: string; readonly modelId: string };
  readonly channel: LegacyHostChannel | undefined;
  readonly sessionId: string;
  readonly timeoutMs: number;
  readonly logger?: KnorviaLogger;
}

/** `provider/testModelConnectivity` 的结果（离线只断言请求构造，不做真实往返）。 */
export interface ProviderConnectivityResult {
  readonly providerId: string;
  readonly modelId: string;
  /** 本次构造出的鉴权材料是否存在 apiKey（**不含值**，S2）。 */
  readonly hasApiKey: boolean;
  /** 本次构造出的鉴权材料是否含自定义 header（**不含值**，S2）。 */
  readonly hasHeaders: boolean;
  readonly source: string;
}

/**
 * 模型连接性测试的离线部分（B10 / D6）。
 *
 * **只做两件事**：拿不到凭据 → **明确失败**（不伪造 `success: true`）；
 * 拿得到 → 返回「构造出了什么形状的鉴权材料」（不含值）。
 *
 * **真实往返**（发一次真请求看连通性）归 `kernel-switch` 实机冒烟——离线不得代劳，
 * 否则会给出「连通」的假结论。
 */
export async function testProviderConnectivity(
  input: ProviderConnectivityInput,
): Promise<ProviderConnectivityResult> {
  const logger = input.logger ?? NOOP_LOGGER;
  const snapshot = await requestProviderCredentials({
    channel: input.channel,
    sessionId: input.sessionId,
    workspace: input.workspace,
    providerId: input.selection.providerId,
    modelSelection: input.selection,
    timeoutMs: input.timeoutMs,
  });

  // 拿不到可用鉴权材料 → 明确失败（B6/B10）。这里不返回 success 形状的结果。
  if (snapshot.apiKey === undefined && snapshot.headers === undefined) {
    throw new Error(
      `No usable credential material for provider "${input.selection.providerId}"; ` +
        "connectivity cannot be reported as successful",
    );
  }

  logger.debug("kernel.credentials.connectivity.probe", {
    providerId: input.selection.providerId,
    modelId: input.selection.modelId,
    // 只记「有没有」，不记值（S2）。
    hasApiKey: snapshot.apiKey !== undefined,
    hasHeaders: snapshot.headers !== undefined,
  });

  return {
    providerId: input.selection.providerId,
    modelId: input.selection.modelId,
    hasApiKey: snapshot.apiKey !== undefined,
    hasHeaders: snapshot.headers !== undefined,
    source: KNORVIA_HOST_SOURCE,
  };
}

/**
 * 装配期校验：三个必需字段缺席即抛错（interface.md §一 接线约定）。
 *
 * 集中一处校验的好处：错误消息能直接指出**缺了哪个字段**，而不是让症状出现在
 * 第一次模型请求上（那时看到的是「拿不到 key」，根因却是装配期少传了一个 getter）。
 */
function assertWired(config: KnorviaCredentialsConfig): void {
  if (typeof config.hostChannel !== "function") {
    throw new Error(
      "kernel-plugin-credentials: config.hostChannel is required " +
        "(wire it to bridge.channelForHostRequests() in the composition root)",
    );
  }
  if (typeof config.sessionContext !== "function") {
    throw new Error(
      "kernel-plugin-credentials: config.sessionContext is required " +
        "(the composition root must supply the current session/workspace/model selection)",
    );
  }
  if (!Array.isArray(config.providers)) {
    throw new Error(
      "kernel-plugin-credentials: config.providers is required (an empty array is allowed)",
    );
  }
}

export { KnorviaCredentialProvider, createKnorviaCredentialProvider } from "./provider.js";
export { buildPiAiProviderTable, KNORVIA_PROVIDER_PROTOCOLS } from "./provider-table.js";
export { providerIdOfCredentialRef, normalizeProviderIdForRef } from "./reference.js";
export {
  requestProviderCredentials,
  DEFAULT_CREDENTIAL_TIMEOUT_MS,
  DEFAULT_CREDENTIAL_REF_PREFIX,
  KNORVIA_HOST_SOURCE,
} from "./credentials-request.js";
export type { KnorviaCredentialSnapshot } from "./credentials-request.js";
export type {
  KnorviaProviderEntry,
  KnorviaProviderModel,
  KnorviaProviderProtocol,
} from "./provider-table.js";
export type { KnorviaLogger } from "./logger.js";
