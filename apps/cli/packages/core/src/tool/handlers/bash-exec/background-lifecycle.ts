// SPDX-License-Identifier: Apache-2.0
// 后台生命周期能力判定：执行端口只有实现「带生命周期的 bash 运行」才能承接
// 显式后台与超时自动转后台；否则退化为前台运行、超时即终止。
import type { ExecutionPort, ExecutionRequest, ExecutionRunOptions } from "@knorvia/contracts";
import type { BashBackgroundLifecycleResult } from "../bash-background-lifecycle.js";

// 端口侧的扩展面（内部形状）：能力判定只看该方法是否存在。
interface BackgroundAwareExecutor extends ExecutionPort {
  runBashWithBackgroundLifecycle: (
    payload: ExecutionRequest,
    transition: { mode: string },
    runOptions?: ExecutionRunOptions,
  ) => Promise<BashBackgroundLifecycleResult>;
}

export function supportsBashBackgroundLifecycle(
  executionPort: ExecutionPort,
): executionPort is BackgroundAwareExecutor {
  const candidate = executionPort as Partial<BackgroundAwareExecutor>;
  return typeof candidate.runBashWithBackgroundLifecycle === "function";
}
