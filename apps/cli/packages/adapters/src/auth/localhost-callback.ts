// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.
// 本地回环 OAuth 回调服务器：监听 127.0.0.1 的随机端口，等待一次授权回调。
// 形状声明见 localhost-callback-types.ts，三个类型在本文件原样再导出。
// 行为约定：
// 一、只绑定回环地址；端口由系统分配，回调 URL 在监听成功后拼出。
// 二、路径或 state 不匹配一律回 404/400，不结束等待（可能是探测请求）。
// 三、授权服务器回传 error 时，等待方收到带稳定错误码的拒绝错误。
// 四、等待只结算一次：后续回调即使到达也不会覆盖首个结果。
// 五、地址解析失败属于创建失败：先关掉服务器再抛错，不留下悬挂监听。
// 六、响应文案面向用户，逐字保留在 CALLBACK_TEXTS 中。

import { createServer, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type {
  LocalhostOAuthCallback,
  LocalhostOAuthCallbackServer,
  McpOAuthCallbackDeniedCode,
  McpOAuthCallbackDeniedError,
} from "./localhost-callback-types.js";

export type {
  LocalhostOAuthCallback,
  LocalhostOAuthCallbackServer,
  McpOAuthCallbackDeniedError,
} from "./localhost-callback-types.js";

/** 拒绝错误的稳定错误码（导出供调用方比较，取值不可改）。 */
export const MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE: McpOAuthCallbackDeniedCode =
  "MCP_OAUTH_CALLBACK_DENIED";

/** 回环地址与三份浏览器可见文案（文案面向用户，逐字保留）。 */
const LOOPBACK_HOST = "127.0.0.1";
const REQUEST_URL_BASE = `http://${LOOPBACK_HOST}`;
const CALLBACK_TEXTS = {
  failure: "Authorization failed. You may close this window and return to the CLI.",
  missingCode: "OAuth callback is missing an authorization code.",
  success: "Authorization successful! You may close this window and return to the CLI.",
} as const;

const STATE_QUERY_PARAM = "state";
const CODE_QUERY_PARAMS = ["authCode", "code"] as const;
const ERROR_QUERY_PARAM = "error";
const ERROR_DESCRIPTION_QUERY_PARAM = "error_description";

const PLAIN_TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" } as const;

function respond(reply: ServerResponse, statusCode: number, body: string): void {
  reply.statusCode = statusCode;
  reply.setHeader("content-type", PLAIN_TEXT_HEADERS["content-type"]);
  reply.end(body);
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function deniedError(
  oauthError: string,
  description: string | undefined,
): McpOAuthCallbackDeniedError {
  const failure = new Error(
    `OAuth authorization was rejected by the authorization server: ${oauthError}`,
  ) as McpOAuthCallbackDeniedError;
  failure.code = MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE;
  failure.oauthError = oauthError;
  if (description !== undefined) failure.oauthErrorDescription = description;
  return failure;
}

/** 监听回环随机端口：listening 与 error 先到者决定结果。 */
function listenOnce(listener: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onFailure = (cause: Error): void => {
      listener.removeListener("listening", onListening);
      reject(cause);
    };
    const onListening = (): void => {
      listener.removeListener("error", onFailure);
      resolve();
    };
    listener.once("error", onFailure);
    listener.once("listening", onListening);
    listener.listen(0, LOOPBACK_HOST);
  });
}

/** 关闭服务器：未监听时直接成功，否则等 close 回调。 */
function shutdown(listener: Server): Promise<void> {
  if (!listener.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    listener.close((cause) => {
      if (cause) reject(cause);
      else resolve();
    });
  });
}

/** 首个结果一旦产生就锁定，后续回调不再改写。 */
function settleController(): {
  settleFailure: (error: Error) => void;
  settleSuccess: (callback: LocalhostOAuthCallback) => void;
  pending: Promise<LocalhostOAuthCallback>;
} {
  let settleResolve!: (callback: LocalhostOAuthCallback) => void;
  let settleReject!: (error: Error) => void;
  let done = false;
  const pending = new Promise<LocalhostOAuthCallback>((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });
  return {
    pending,
    settleFailure: (error) => {
      if (done) return;
      done = true;
      settleReject(error);
    },
    settleSuccess: (callback) => {
      if (done) return;
      done = true;
      settleResolve(callback);
    },
  };
}

interface CallbackRequestContext {
  expectedPath: string;
  expectedState: string;
  settleFailure: (error: Error) => void;
  settleSuccess: (callback: LocalhostOAuthCallback) => void;
}

/** 处理一次回调请求：路径/state 校验 → 错误回传 → 授权码。 */
function handleCallback(
  incoming: { url?: string | undefined },
  reply: ServerResponse,
  context: CallbackRequestContext,
): void {
  const requestUrl = new URL(incoming.url ?? "/", REQUEST_URL_BASE);
  if (requestUrl.pathname !== context.expectedPath) {
    respond(reply, 404, CALLBACK_TEXTS.failure);
    return;
  }
  if ((requestUrl.searchParams.get(STATE_QUERY_PARAM) ?? "") !== context.expectedState) {
    respond(reply, 400, CALLBACK_TEXTS.failure);
    return;
  }

  const oauthError = requestUrl.searchParams.get(ERROR_QUERY_PARAM);
  if (oauthError) {
    const description = requestUrl.searchParams.get(ERROR_DESCRIPTION_QUERY_PARAM) || undefined;
    respond(reply, 400, CALLBACK_TEXTS.failure);
    context.settleFailure(deniedError(oauthError, description));
    return;
  }

  const code = CODE_QUERY_PARAMS.map((name) => requestUrl.searchParams.get(name)).find(
    (value) => value !== null,
  );
  if (code) {
    respond(reply, 200, CALLBACK_TEXTS.success);
    context.settleSuccess({ code, url: requestUrl.toString() });
    return;
  }

  respond(reply, 400, CALLBACK_TEXTS.failure);
  context.settleFailure(new Error(CALLBACK_TEXTS.missingCode));
}

/** 监听成功后拼出对外回调 URL；地址异常时关掉服务器并抛错。 */
async function resolveCallbackUrl(listener: Server, callbackPath: string): Promise<string> {
  await listenOnce(listener);
  const bound = listener.address();
  if (bound === null || typeof bound === "string") {
    try {
      await shutdown(listener);
    } catch {
      // The fixed address-resolution failure remains the creation result.
    }
    throw new Error("Unable to resolve localhost callback server address.");
  }
  return `http://${LOOPBACK_HOST}:${bound.port}${callbackPath}`;
}

export async function createLocalhostOAuthCallbackServer(input: {
  callbackPath: string;
  state: string;
}): Promise<LocalhostOAuthCallbackServer> {
  const { pending, settleFailure, settleSuccess } = settleController();
  const listener = createServer((incoming, reply) => {
    try {
      handleCallback(incoming, reply, {
        expectedPath: input.callbackPath,
        expectedState: input.state,
        settleFailure,
        settleSuccess,
      });
    } catch (cause) {
      respond(reply, 500, CALLBACK_TEXTS.failure);
      settleFailure(toError(cause));
    }
  });

  const callbackUrl = await resolveCallbackUrl(listener, input.callbackPath);
  return {
    callbackPath: input.callbackPath,
    callbackUrl,
    close: () => shutdown(listener),
    waitForCallback: () => pending,
  };
}
