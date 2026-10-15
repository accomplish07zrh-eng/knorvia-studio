// SPDX-License-Identifier: Apache-2.0
// 权限 broker 的能力判定（B14）：两个结构化类型谓词，判定端口对象上是否多出某一个可选方法。
// 判定口径：缺方法、或同名字段不是函数，一律 false；不判空——null/undefined 会在属性读取处
// 抛 TypeError（调用方永远传端口对象，见 known-differences.md 裁定 1，不补业务兜底）。
import type {
  PermissionBrokerPort,
  PermissionBrokerRequest,
  PermissionBrokerResult,
} from "../../deps.js";

// 能力扩展面：能按 id / toolCallId 结算的 broker。
export interface ResolvablePermissionBroker extends PermissionBrokerPort {
  resolvePermission(requestIdOrToolCallId: string, result: PermissionBrokerResult): boolean; // 结算一次授权
}

// 能力扩展面：能列出挂起请求的 broker。
export interface InspectablePermissionBroker extends PermissionBrokerPort {
  listPendingRequests(): PermissionBrokerRequest[]; // 返回当前挂起的请求清单
}

// 方法探测：只看「同名字段是不是函数」，不看签名，也不触碰其它字段。
function exposesMethod(candidate: object, method: string): boolean {
  return typeof (candidate as Record<string, unknown>)[method] === "function";
}

// 是否具备「按 id 结算」能力。
export const isResolvablePermissionBroker = (
  candidate: PermissionBrokerPort,
): candidate is ResolvablePermissionBroker => exposesMethod(candidate, "resolvePermission");

// 是否具备「列出挂起请求」能力。
export const isInspectablePermissionBroker = (
  candidate: PermissionBrokerPort,
): candidate is InspectablePermissionBroker => exposesMethod(candidate, "listPendingRequests");
