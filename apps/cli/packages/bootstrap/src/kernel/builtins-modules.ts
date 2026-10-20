// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 本包自有插件行在组合里的模块标识。
//
// DSH Loader 只认磁盘上可解析的模块：裸包名（含子路径）或绝对文件地址。
// 这里用裸包名子路径而不是 `file:` 地址，是因为 Knorvia 的内核会被 esbuild 打进
// `knorvia.cjs` 单文件 —— 那时 `import.meta.url` 不存在，用它的地址解析会在
// 打包版里失败（实测：`fileURLToPath(undefined)`）。裸包名交给 Node 模块解析，
// 开发树与打包 stage 出来的依赖树都能解析到同一份 dist 产物。

/**
 * 三个插件行的模块标识。字段名是组合行 `name` 的用途，不是子路径名。
 */
export interface KernelPluginModuleIds {
  /** 运行环境上下文（修正二）。 */
  readonly runtimeContext: string;
  /** POSIX shell 执行器（修正一）。 */
  readonly bash: string;
  /** Windows shell 执行器（修正一）。 */
  readonly pwsh: string;
}

/** 包名；与 package.json 的 `name` 一致。三条子路径都挂在它下面。 */
const BOOTSTRAP_PACKAGE = "@knorvia/bootstrap";

/** 运行环境上下文插件的子路径；与 package.json `exports` 的键对应。 */
const RUNTIME_CONTEXT_SUBPATH = "kernel/runtime-context";
/** POSIX shell 执行器插件的子路径；同上。 */
const BASH_SUBPATH = "kernel/shell-environment-bash";
/** Windows shell 执行器插件的子路径；同上。 */
const PWSH_SUBPATH = "kernel/shell-environment-pwsh";

/** 拼一条完整模块标识：包名加子路径。 */
function addressOf(subpath: string): string {
  return [BOOTSTRAP_PACKAGE, subpath].join("/");
}

/**
 * 计算三个模块标识。
 *
 * @returns 供组合行 `name` 使用的模块标识。
 */
export function kernelPluginModuleIds(): KernelPluginModuleIds {
  const runtimeContext = addressOf(RUNTIME_CONTEXT_SUBPATH);
  const bash = addressOf(BASH_SUBPATH);
  const pwsh = addressOf(PWSH_SUBPATH);
  return { runtimeContext, bash, pwsh };
}
