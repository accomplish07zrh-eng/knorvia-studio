// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 凭据 provider 的**组合行位置**（本包只提供位置与约定，不实现凭据逻辑）。
//
// 为什么需要这一层：
//   - `llm-pi-ai` 的 `apiKeyEnv` 解析先问 `ctx.credentials`、再回退启动环境
//     （`dsh-llm-pi-ai/lib/index.js` 的 `authContextFrom().env()`）；
//   - 但 `kernel-dsh-00` 的进程级清洗删掉了所有 `*_API_KEY`，所以「启动环境」这条
//     回退在 dsh 引擎下拿不到 key —— **必须有 `ctx.credentials` 提供者**；
//   - `@deepseek-ai/dsh-credentials` 只导出**抽象基类** `CredentialProvider`
//     （自身静态属性只有 length/name/prototype，没有 `Config`、没有自定义 `apply`；
//     若看到 `apply` 那是 `Function.prototype.apply`，不是插件入口），
//     **不能作为组合行挂载**；它把「实现」留给使用方。
//
// 因此分工是：
//   - **本包**（`kernel-dsh-builtins`）：给出「该挂在哪一行、行长什么样」的约定；
//   - **`kernel-plugin-credentials`**（#235）：提供具体 provider 插件，在它的 `apply(ctx)`
//     里供出 `credentials` 服务，从而真正让 `ctx.credentials` 可用。

/**
 * 凭据 provider 插件的组合行 id。
 *
 * 注意这是**行的注册名**，不是服务名：`CredentialProvider` 基类的构造已经固定为
 * `super(ctx, "credentials")`，服务名由 DSH 决定；这里只决定「组合里那一行叫什么」。
 */
export const KERNEL_CREDENTIAL_PROVIDER_ROW_ID = "knorvia-credentials";

/** 凭据 provider 的组合行：行注册名 + 可解析的模块标识。 */
export interface KernelCredentialProviderRow {
  /** 行 id；同一组合内唯一，等于 {@link KERNEL_CREDENTIAL_PROVIDER_ROW_ID}。 */
  readonly rowId: string;
  /** 模块标识：裸包名子路径或绝对文件地址，交给 DSH Loader 解析。 */
  readonly moduleId: string;
}

/**
 * 造「挂载凭据 provider」的组合行。
 *
 * **调用方义务**：`moduleId` 指向的模块必须是一个 DSH 插件，且在其 `apply(ctx)` 里
 * 提供 `credentials` 服务（DSH 的 `CredentialProvider` 子类在构造时即
 * `super(ctx, "credentials")`，所以挂上该类的一行就等于供出 `ctx.credentials`）。
 *
 * 本函数只产出配置：凭据来源（Knorvia 凭据服务、Host 反向请求）归
 * `kernel-plugin-credentials`，不在本包实现。
 *
 * @param moduleId - 凭据 provider 插件的可解析模块标识。
 * @returns 可直接追加进组合的行。
 * @throws 当模块标识为空时（配置错误应当早失败，而不是挂一个解析不到的模块）。
 */
export function createKernelCredentialProviderRow(moduleId: string): KernelCredentialProviderRow {
  const resolved = moduleId.trim();
  if (resolved === "") throw new Error("credential provider row requires a module id");
  return { rowId: KERNEL_CREDENTIAL_PROVIDER_ROW_ID, moduleId: resolved };
}
