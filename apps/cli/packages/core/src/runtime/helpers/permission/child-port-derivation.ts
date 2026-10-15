// SPDX-License-Identifier: Apache-2.0
// child runtime 的「对外交互」端口派生（B16 的端口半边，唯一出口）。
// 两条会话身份轴：账本身份 sessionId 归子自己（事件持久化 / transcript / trace / session
// store）；路由身份归父——一切 agent → app 反向请求（permission、AskUserQuestion、provider
// runtime headers）都必须用父会话，直到根会话。客户端只认识根会话，拿子会话去问，桌面侧
// 找不到 session，response 永不发出，子代理挂死。
// 派生由**父 runtime** 调用，parentSessionId 由父自己填，调用方给不了错误值；父侧端口缺席时
// 对应子端口整体缺席，不造空壳；多层嵌套时外层后写，最终值必然是根会话。
import type { PermissionBrokerPort, SessionId } from "../../deps.js";
import type { ProviderRuntimeHeadersPort } from "../../types.js";
import type { SubagentInteractionOriginContext } from "../../../subagent/interaction-origin.js";
import { createSubagentInteractionBroker } from "./subagent-request-routing.js";

// 一个 runtime 面向协议客户端的端口集合（B16 端口半边的兼容形状）。
export /* 客户端面端口集合 */ interface ClientFacingPorts {
  // 两个端口都可缺席：缺席即子侧不派生。
  permissionBroker?: /* 权限反向请求走父会话路由 */ PermissionBrokerPort;
  providerRuntimeHeadersPort?: /* 凭据 header 刷新同样走父会话 */ ProviderRuntimeHeadersPort;
}

// 铸造 child 所需归属信息；parentSessionId 不在其中——它只能由父 runtime 提供。
export type ChildClientPortsContext = Omit<
  SubagentInteractionOriginContext,
  "parentSessionId" // 路由身份只由父 runtime 填
>;

export const deriveChildClientPorts = (
  parentPorts: ClientFacingPorts,
  ownership: ChildClientPortsContext & { parentSessionId: SessionId },
): ClientFacingPorts => {
  // 父侧缺席的端口在子侧整体缺席，逐项按需派生。
  const derived: ClientFacingPorts = {};
  if (parentPorts.permissionBroker !== undefined) {
    derived.permissionBroker = createSubagentInteractionBroker(
      parentPorts.permissionBroker,
      ownership,
    );
  }
  if (parentPorts.providerRuntimeHeadersPort !== undefined) {
    derived.providerRuntimeHeadersPort = rerouteHeadersPort(
      parentPorts.providerRuntimeHeadersPort,
      ownership.parentSessionId,
    );
  }
  return derived;
};

// 头部端口的重路由形状：两个方法都换一层壳，入参的 sessionId 改写成根会话。
type ReroutedHeadersPort = ProviderRuntimeHeadersPort;

// provider runtime headers 是独立的反向协议请求，不经子事件镜像：刷新账号凭据 header 时必须
// 用父会话路由。服务层会识别请求模型与父会话当前模型是否一致，不一致时只同步本次 header。
function rerouteHeadersPort(
  upstream: ProviderRuntimeHeadersPort,
  rootSessionId: SessionId,
): ReroutedHeadersPort {
  const rerouted: ReroutedHeadersPort = {
    shouldRefreshBeforeModelRequest: (input) =>
      upstream.shouldRefreshBeforeModelRequest?.(input) ?? true,
    refreshBeforeModelRequest: (input) =>
      upstream.refreshBeforeModelRequest({ ...input, sessionId: rootSessionId }),
  };
  return rerouted;
}
