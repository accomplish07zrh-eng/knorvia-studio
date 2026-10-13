// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.
// 本地回环 OAuth 回调的形状声明：由 localhost-callback.ts 原样再导出，公开面不变。
// 字段/方法说明（字段名与方法名是契约）：
// code/url：回调带回的授权码与完整回调 URL。
// callbackPath/callbackUrl：本服务器对外暴露的路径与地址。
// close()/waitForCallback()：关闭服务器与等待一次回调结果。
// code/oauthError/oauthErrorDescription：拒绝错误上的稳定错误码与授权服务器回传信息。

/** 拒绝错误的稳定错误码取值（与实现侧常量同字面量）。 */
export type McpOAuthCallbackDeniedCode = "MCP_OAUTH_CALLBACK_DENIED";

export interface McpOAuthCallbackDeniedError extends Error {
  code: McpOAuthCallbackDeniedCode;
  oauthError: string;
  oauthErrorDescription?: string;
}

export interface LocalhostOAuthCallback {
  code: string;
  url: string;
}

export interface LocalhostOAuthCallbackServer {
  callbackPath: string;
  callbackUrl: string;
  close(): Promise<void>;
  waitForCallback(): Promise<LocalhostOAuthCallback>;
}
