// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 子进程网络出口的形状声明：由 subprocess-env.ts 再导出既有导出名，公开面不变。
// 字段说明（调用方按这些字段构造对象，字段名是契约）：
// caCertFile / httpProxy / noProxy：策略侧的三项覆盖值，优先于 sourceEnv 里的同名配置。
// platform：目标平台，决定环境变量名是否做大小写折叠（Windows 分支）。
// sourceEnv：取值来源快照，允许就是待写入的 env 本身。
// toolEnvPassthrough：是否把工具透传环境合入目标 env，默认开启。

export interface NetworkEgressEnvPolicy {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
}

export interface NetworkEgressEnvOptions {
  network?: NetworkEgressEnvPolicy;
  platform?: NodeJS.Platform;
  sourceEnv?: Record<string, string | undefined>;
  toolEnvPassthrough?: boolean;
}
