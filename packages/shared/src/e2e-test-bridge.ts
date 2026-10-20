// SPDX-License-Identifier: Apache-2.0

/** 桥接开关读取的环境变量名（`VITE_` 前缀表示由构建期注入）。 */
type E2ETestBridgeVariable = "VITE_KNORVIA_E2E_STORE_BRIDGE" | "KNORVIA_E2E_RUN_ID";

/**
 * Main/preload 暴露 E2E 桥时消费的环境快照。
 *
 * 两个变量都是可选的字符串：缺失等价于「未开启」，调用方不需要补默认值。
 */
export type E2ETestBridgeEnvironment = Partial<Record<E2ETestBridgeVariable, string>>;

/** 专用 build flag 的唯一开启值。 */
const E2E_BRIDGE_FLAG_ON = "1";

/**
 * E2E 能力必须同时命中专用 build flag 和真实 runner run id。
 *
 * `KNORVIA_ENV=test` 只是产品环境，不能据此扩大 renderer 可读面：
 * 单独伪造任意一个值都不应打开桥。
 */
export function shouldEnableE2ETestBridge(environment: E2ETestBridgeEnvironment): boolean {
  if (environment.VITE_KNORVIA_E2E_STORE_BRIDGE !== E2E_BRIDGE_FLAG_ON) return false;
  const runId = environment.KNORVIA_E2E_RUN_ID;
  return typeof runId === "string" && runId.trim() !== "";
}
