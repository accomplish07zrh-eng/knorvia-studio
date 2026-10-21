// SPDX-License-Identifier: Apache-2.0
// services-03 合同桩：studio-runtime/domain/workspaceRuntime
// 运行期 import 即抛，用于验证契约测试对公开行为的防线有效性（contract-gate allFail）。
throw new Error("not implemented: services-03");

export class WorkspaceRuntimeFault { constructor(..._args: unknown[]) { throw new Error("not implemented: services-03"); } }
export function validateWorkspaceRuntimeControl(..._args: unknown[]): unknown { throw new Error("not implemented: services-03"); }
export function workspaceRuntimeCommand(..._args: unknown[]): unknown { throw new Error("not implemented: services-03"); }
