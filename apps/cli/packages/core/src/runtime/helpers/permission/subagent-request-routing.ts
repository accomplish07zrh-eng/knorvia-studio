// SPDX-License-Identifier: Apache-2.0
// 子 Agent 交互中转（B16 的 broker 半边）：包装父 broker，把子代理的反向请求路由回父会话。
// 会话身份轴：事件/账本用子自己的 sessionId；agent → app 的反向请求（permission、
// AskUserQuestion、ExitPlanMode）必须以父会话路由——客户端只认识根会话，拿子会话去问，
// 桌面侧找不到 session，response 永不发出，子代理挂死。
// 包装可叠加：sessionId 由**外层**（离客户端更近的一层）最后改写，任意深度最终都落到根会话；
// origin 反过来只在缺失时写入，归属恒为真正发起请求的那个子代理，不被外层覆盖成中间层。
// requestPermission 等价于「先 prepare 再 activate」；本模块不吞父 broker 的异常、不打日志。
import type {
  PermissionBrokerPort,
  PermissionBrokerRequest,
  PermissionBrokerRequestOptions,
  PermissionBrokerResult,
} from "../../deps.js";
import {
  buildSubagentInteractionOrigin,
  type SubagentInteractionOriginContext,
} from "../../../subagent/interaction-origin.js";
import { activatePermissionRequest } from "../../../permission/prepared-request.js";

// 归属上下文：在来源上下文之上可补父工具调用 id。
export interface SubagentInteractionContext extends SubagentInteractionOriginContext {
  parentToolCallId?: /* 父工具调用 id，随 origin 记录 */ | PermissionBrokerRequest["toolCallId"]
    | string;
}

export const createSubagentInteractionBroker = (
  upstream: PermissionBrokerPort,
  ownership: SubagentInteractionContext,
): PermissionBrokerPort => {
  // 路由改写：sessionId 落父会话，origin 缺省时按归属上下文生成、已有值原样保留。
  const routeRequest = (
    request: /* 被路由的授权请求 */ PermissionBrokerRequest,
    options?: /* 透传给父 broker 的选项 */ PermissionBrokerRequestOptions,
  ): ReturnType<PermissionBrokerPort["preparePermission"]> =>
    upstream.preparePermission(
      {
        ...request, // 其余请求字段原样带上
        sessionId: ownership.parentSessionId,
        origin: request.origin ?? buildSubagentInteractionOrigin(ownership, request.turnId),
      },
      options /* 原样透传 */,
    );

  const wrapped: PermissionBrokerPort = {
    preparePermission: routeRequest,
    requestPermission: (request, options) =>
      activatePermissionRequest(routeRequest(request, options)),
  };
  return wrapped;
};
