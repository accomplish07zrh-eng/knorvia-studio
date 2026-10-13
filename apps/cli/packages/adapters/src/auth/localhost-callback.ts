// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.

import { createServer, type Server, type ServerResponse } from "node:http";

export const MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE: McpOAuthCallbackDeniedCode =
  "MCP_OAUTH_CALLBACK_DENIED";

export type {
  LocalhostOAuthCallback,
  LocalhostOAuthCallbackServer,
  McpOAuthCallbackDeniedError,
  McpOAuthCallbackDeniedCode,
} from "./localhost-callback-types.js";

import type {
  McpOAuthCallbackDeniedCode,
  LocalhostOAuthCallback,
  LocalhostOAuthCallbackServer,
  McpOAuthCallbackDeniedError,
} from "./localhost-callback-types.js";

/** 回环地址与三份浏览器可见文案（文案面向用户，逐字保留）。 */
const LOOPBACK_HOST = "127.0.0.1";
const REQUEST_URL_BASE = `http://${LOOPBACK_HOST}`;
const CALLBACK_TEXTS = {
  failure: "Authorization failed. You may close this window and return to the CLI.",
  missingCode: "OAuth callback is missing an authorization code.",
  success: "Authorization successful! You may close this window and return to the CLI.",
} as const;

function writeResponse(response: ServerResponse, statusCode: number, text: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(text);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createDeniedError(
  oauthError: string,
  oauthErrorDescription: string | undefined,
): McpOAuthCallbackDeniedError {
  const error = new Error(
    `OAuth authorization was rejected by the authorization server: ${oauthError}`,
  ) as McpOAuthCallbackDeniedError;
  error.code = MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE;
  error.oauthError = oauthError;
  if (oauthErrorDescription !== undefined) {
    error.oauthErrorDescription = oauthErrorDescription;
  }
  return error;
}

function listenOnLoopback(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function createLocalhostOAuthCallbackServer(input: {
  callbackPath: string;
  state: string;
}): Promise<LocalhostOAuthCallbackServer> {
  let settleResolve!: (callback: LocalhostOAuthCallback) => void;
  let settleReject!: (error: Error) => void;
  let settled = false;
  const callbackPromise = new Promise<LocalhostOAuthCallback>((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });

  const settleSuccess = (callback: LocalhostOAuthCallback): void => {
    if (settled) return;
    settled = true;
    settleResolve(callback);
  };
  const settleFailure = (error: Error): void => {
    if (settled) return;
    settled = true;
    settleReject(error);
  };

  let callbackUrl = "";
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", REQUEST_URL_BASE);
      if (requestUrl.pathname !== input.callbackPath) {
        writeResponse(response, 404, CALLBACK_TEXTS.failure);
        return;
      }
      if ((requestUrl.searchParams.get("state") ?? "") !== input.state) {
        writeResponse(response, 400, CALLBACK_TEXTS.failure);
        return;
      }

      const oauthError = requestUrl.searchParams.get("error");
      if (oauthError) {
        const description = requestUrl.searchParams.get("error_description") || undefined;
        writeResponse(response, 400, CALLBACK_TEXTS.failure);
        settleFailure(createDeniedError(oauthError, description));
        return;
      }

      const code = requestUrl.searchParams.get("authCode") ?? requestUrl.searchParams.get("code");
      if (code) {
        writeResponse(response, 200, CALLBACK_TEXTS.success);
        settleSuccess({ code, url: requestUrl.toString() });
        return;
      }

      writeResponse(response, 400, CALLBACK_TEXTS.failure);
      settleFailure(new Error(CALLBACK_TEXTS.missingCode));
    } catch (error) {
      writeResponse(response, 500, CALLBACK_TEXTS.failure);
      settleFailure(asError(error));
    }
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    try {
      await closeServer(server);
    } catch {
      // The fixed address-resolution failure remains the creation result.
    }
    throw new Error("Unable to resolve localhost callback server address.");
  }
  callbackUrl = `http://${LOOPBACK_HOST}:${address.port}${input.callbackPath}`;

  return {
    callbackPath: input.callbackPath,
    callbackUrl,
    close: () => closeServer(server),
    waitForCallback: () => callbackPromise,
  };
}
