// SPDX-License-Identifier: Apache-2.0
export interface E2ETestBridgeEnvironment {
  VITE_KNORVIA_E2E_STORE_BRIDGE?: string;
  KNORVIA_E2E_RUN_ID?: string;
}

/**
 * 校验是否启用 E2E 测试桥接。
 * 必须显式声明 VITE_KNORVIA_E2E_STORE_BRIDGE 恰为 "1" 且 KNORVIA_E2E_RUN_ID 经 trim 后非空。
 */
export function shouldEnableE2ETestBridge(env: E2ETestBridgeEnvironment): boolean {
  if (env.VITE_KNORVIA_E2E_STORE_BRIDGE !== "1") {
    return false;
  }
  const runId = env.KNORVIA_E2E_RUN_ID;
  return typeof runId === "string" && runId.trim().length > 0;
}
