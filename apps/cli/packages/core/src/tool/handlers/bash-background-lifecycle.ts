// SPDX-License-Identifier: Apache-2.0
// 兼容面：后台生命周期的形状定义（兼容声明块）与能力判定函数。
// 判定实现已重组于 bash-exec/background-lifecycle.ts，本模块路径的导出不变。
export { supportsBashBackgroundLifecycle } from "./bash-exec/background-lifecycle.js";

export type BashBackgroundLifecycleMode = "explicit" | "auto_on_timeout";

export type BashBackgroundLifecycleResult =
  | {
      kind: "foreground";
      result: import("@knorvia/contracts").ExecutionResult;
    }
  | {
      kind: "backgrounded";
      task: import("@knorvia/contracts").BackgroundExecutionStartResult;
    };
