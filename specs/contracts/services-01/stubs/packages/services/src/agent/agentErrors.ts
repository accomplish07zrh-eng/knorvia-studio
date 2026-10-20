// SPDX-License-Identifier: Apache-2.0
// services-01 合同桩：agent/agentErrors.ts
// 运行时 import 即抛，用于验证契约测试对公开行为的防御有效性（contract-gate allFail）。
throw new Error("not implemented: services-01");

export const KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE: unknown = undefined;
export class KnorviaAgentMcpStatusModeUnsupportedError {
  constructor(..._args: unknown[]) {
    throw new Error("not implemented: services-01");
  }
}
export function isKnorviaAgentMcpStatusModeUnsupportedError(..._args: unknown[]): unknown {
  throw new Error("not implemented: services-01");
}
