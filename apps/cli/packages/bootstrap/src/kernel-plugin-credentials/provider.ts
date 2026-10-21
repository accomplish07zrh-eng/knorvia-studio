// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-credentials：DSH 凭据服务 provider（本包的核心实现）。
//
// 契约依据：specs/contracts/kernel-plugin-credentials/{interface,behavior}.md（B1/B5/B6/B7/D1/D3/D4）
//
// 为什么必须实现这个类：`dsh-llm-pi-ai` 的凭据解析先问 `ctx.credentials`，取不到再回退
// 启动环境（`launchEnvironmentOf(ctx)`）。而 `kernel-dsh-00` 的进程级清洗删掉了所有
// `*_API_KEY`，因此**没有本 provider，dsh 引擎下的模型请求必然拿不到 key**。
//
// 两条通道（实测 `dsh-llm-pi-ai` 源码得出，见 interface.md §2.4）：
//   - `resolve(ref)`   —— `env()` 用，只能承载**单个字符串**（api key）；
//   - `readRecord(key)` —— 承载结构化 `ApiKeyRecord`（`key` + `env`），headers 场景走这里。

import {
  CredentialProvider,
  type CredentialInfo,
  type CredentialKey,
  type CredentialRecord,
  type CredentialRecordEntry,
  type CredentialRecordInfo,
  type CredentialRef,
  type ResolvedCredential,
} from "@deepseek-ai/dsh-credentials";
import { Context } from "@deepseek-ai/cordis";
import {
  KNORVIA_HOST_SOURCE,
  requestProviderCredentials,
  type KnorviaCredentialSnapshot,
} from "./credentials-request.js";
import { readRecordProviderId } from "./reference.js";
import type { KnorviaLogger } from "./logger.js";
import type { LegacyHostChannel } from "../kernel-bridge/legacy/types.js";

/** 未配置时的 `describe` 结果（基类契约：`configured: false` + 不可写）。 */
const UNCONFIGURED: CredentialInfo = { configured: false, writable: false };

/** 写入面统一拒绝的原因文案（D3：Knorvia 凭据由 Host 持有，CLI 侧只读）。 */
const READ_ONLY_REASON = "Knorvia credentials are owned by the host and are read-only here";

/** `dsh-llm-pi-ai` 写入凭据记录的 scope（其 `RECORD_SCOPE` 常量）。 */
const LLM_PI_AI_RECORD_SCOPE = "llm-pi-ai";

/**
 * 纯 header 场景下 `resolve()` 的占位值。
 *
 * 刻意选一个不可能与真实 key 混淆的字符串，**不含任何凭据内容**。
 * 理由见 D2：`resolve()` 只能承载单个字符串，headers 走 `readRecord().env`。
 */
export const HEADER_ONLY_PLACEHOLDER = "knorvia-header-only-credential";

/** 构造 provider 所需的依赖（由插件入口 / 测试注入）。 */
export interface KnorviaProviderDeps {
  /** 取当前通道；未 attach 返回 undefined（B5/B6）。 */
  readonly channel: () => LegacyHostChannel | undefined;
  readonly sessionId: string;
  readonly workspace: { readonly workspacePath: string; readonly workspaceKey: string };
  readonly modelSelection: { readonly providerId: string; readonly modelId: string };
  readonly credentialRefPrefix: string;
  readonly credentialRequestTimeoutMs: number;
  readonly logger?: KnorviaLogger;
}

/**
 * DSH 凭据服务的 Knorvia 实现。
 *
 * **唯一写入者是 Host**：本类只实现读的一半，四个写入方法一律抛错（D3）——
 * 静默成功会让配置界面误以为写入生效（基类文档明确警告「read-only source 遮蔽时
 * 写入会看似成功」）。
 */
export class KnorviaCredentialProvider extends CredentialProvider {
  private readonly deps: KnorviaProviderDeps;

  constructor(ctx: Context, deps: KnorviaProviderDeps) {
    // 基类构造函数即 `super(ctx, "credentials")` —— 服务名在此固定，本包不自选（D1）。
    super(ctx);
    this.deps = deps;
  }

  /**
   * 解析一个引用为当前值。
   *
   * **每次调用都发一次反向请求**（D4 / 基类契约「Resolution is per call」）。
   *
   * 返回 `undefined` 的语义是**「这个引用不归我管」**（前缀不匹配），
   * **不是「这次取失败」**——后者一律抛错（interface.md §3.5 / B6）。
   */
  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const providerId = this.providerIdOf(ref);
    if (providerId === undefined) {
      // 不在本 provider 的命名空间：消费者会继续问下一个来源。
      this.deps.logger?.debug("kernel.credentials.resolve.foreign-ref", { ref });
      return undefined;
    }

    const snapshot = await this.request(providerId);
    const value = this.channelValue(snapshot, providerId);
    this.deps.logger?.debug("kernel.credentials.resolve.ok", {
      providerId,
      hasHeaders: snapshot.headers !== undefined,
      // 绝不记 apiKey / headers 的值（S2/B9）。
    });
    return { value, source: KNORVIA_HOST_SOURCE };
  }

  /** 只报「是否已配置 / 来源 / 是否可写」，**绝不**返回值（基类契约）。 */
  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const providerId = this.providerIdOf(ref);
    if (providerId === undefined) return UNCONFIGURED;
    try {
      await this.request(providerId);
      return { configured: true, source: KNORVIA_HOST_SOURCE, writable: false };
    } catch {
      // 取不到 = 未配置。`describe` 是配置界面的只读查询，不抛出：
      // 让「Host 暂时不可用」表现为「未配置」是可接受的降级（不涉及凭据丢失）。
      return UNCONFIGURED;
    }
  }

  /**
   * 读一条记录（通道 B，见 interface.md §2.4）。
   *
   * `dsh-llm-pi-ai` 用 `recordKeyFor(providerId)` 读这里，拿到结构化 `ApiKeyRecord`
   * （`key` + `env`）——**headers 场景必须走这条通道**，因为 `resolve()` 只能承载单字符串。
   */
  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    const providerId = readRecordProviderId(key, LLM_PI_AI_RECORD_SCOPE);
    if (providerId === undefined) return undefined;

    const snapshot = await this.request(providerId);
    return {
      kind: "api-key",
      ...(snapshot.apiKey !== undefined ? { key: snapshot.apiKey } : {}),
      // headers 保真放进 `env`：`Record<string, string>` 结构不丢（D2 第 1 条处置）。
      ...(snapshot.headers !== undefined ? { env: { ...snapshot.headers } } : {}),
    };
  }

  /**
   * 只报存在性与归属，**绝不**返回值。
   *
   * **`configured` 的判据是「record 是否存在」**（interface.md §3.6）：基类文档明确
   * 「`ApiKeyRecord` 即使既无 `key` 也无 `env`，也表示 owner 确认该路由走 ambient 认证，
   * 是 configured 而非 blank」——因此不能用「有值」判断。
   */
  async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const providerId = readRecordProviderId(key, LLM_PI_AI_RECORD_SCOPE);
    if (providerId === undefined) return { configured: false, writable: false };
    try {
      await this.request(providerId);
      // 能取到材料就说明 record 存在；没有 record 时 Host 会拒绝 → catch 分支。
      return { configured: true, kind: "api-key", writable: false };
    } catch {
      return { configured: false, writable: false };
    }
  }

  /**
   * 枚举记录。
   *
   * 本 provider 不承载记录面（Knorvia 凭据属 Host，CLI 侧没有本地记录存储），
   * 因此恒为空——**不伪造**「有哪些凭据」这种事实。
   */
  async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return [];
  }

  /** 写入面拒绝（D3）。 */
  async set(): Promise<void> {
    throw new Error(READ_ONLY_REASON);
  }

  /** 写入面拒绝（D3）。 */
  async unset(): Promise<void> {
    throw new Error(READ_ONLY_REASON);
  }

  /** 写入面拒绝（D3）。 */
  async modifyRecord(): Promise<CredentialRecord | undefined> {
    throw new Error(READ_ONLY_REASON);
  }

  /** 写入面拒绝（D3）。 */
  async deleteRecord(): Promise<void> {
    throw new Error(READ_ONLY_REASON);
  }

  /** 每次调用都真实往返一次（D4：不缓存）。 */
  private request(providerId: string): Promise<KnorviaCredentialSnapshot> {
    return requestProviderCredentials({
      channel: this.deps.channel(),
      sessionId: this.deps.sessionId,
      workspace: this.deps.workspace,
      providerId,
      modelSelection: this.deps.modelSelection,
      timeoutMs: this.deps.credentialRequestTimeoutMs,
    });
  }

  /** 从引用名还原 providerId；前缀不匹配时 undefined。 */
  private providerIdOf(ref: CredentialRef | string): string | undefined {
    const name = String(ref);
    const prefix = this.deps.credentialRefPrefix;
    if (!name.startsWith(prefix)) return undefined;
    const rest = name.slice(prefix.length);
    return rest.length === 0 ? undefined : rest;
  }

  /**
   * 通道 A（`resolve`）该返回什么。
   *
   * 三条规则（interface.md §2.4）：
   *   1. 有 apiKey → 返回 apiKey；
   *   2. 只有 headers → 返回**明确标记的占位值** + debug 日志（D2）；
   *   3. 两者都没有 → **抛明确错误**（B6），不让请求裸奔。
   */
  private channelValue(snapshot: KnorviaCredentialSnapshot, providerId: string): string {
    if (snapshot.apiKey !== undefined) return snapshot.apiKey;

    if (snapshot.headers !== undefined) {
      this.deps.logger?.debug("kernel.credentials.header-only", {
        providerId,
        note:
          "headers are carried through readRecord().env; " +
          "this llm-pi-ai version does not inject per-request headers",
      });
      return HEADER_ONLY_PLACEHOLDER;
    }

    throw new Error(
      `No usable credential material for provider "${providerId}"; ` +
        "the host returned neither an api key nor headers",
    );
  }
}

/**
 * 建一个 provider 实例（插件入口与测试共用同一构造路径）。
 *
 * 测试直驱时可能没有 Cordis context：此时**建一个真实 `Context`**，而不是传一个假的
 * 最小对象——`Service`（基类的基类）的构造会读 `ctx.provide`，假对象会在构造期就炸
 * （`Cannot read properties of undefined (reading 'provide')`）。
 * 生产路径始终由 `apply(ctx)` 传入真实 context。
 */
export function createKnorviaCredentialProvider(
  deps: KnorviaProviderDeps,
  ctx?: Context,
): KnorviaCredentialProvider {
  return new KnorviaCredentialProvider(ctx ?? new Context(), deps);
}
