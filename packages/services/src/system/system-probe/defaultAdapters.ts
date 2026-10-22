// SPDX-License-Identifier: Apache-2.0
// 内网探测的默认适配器：一次 TCP 握手、一次 HTTP 服务响应。
//
// 这里只产出「单次尝试」的原始观测（耗时与 marker）。重试次数、成功门槛与
// 最终判定都不属于本文件 —— 它们分别由 targetLifecycle 与 OwnerPolicy 决定。

import { once } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createConnection } from "node:net";

import type { OwnerPolicy, ServiceParameters, TcpParameters } from "./contracts.js";

/** 短期令牌头名，与 shared 的 `IntranetProbeServiceTarget.token` 约定一致。 */
const TOKEN_HEADER = "x-knorvia-intranet-token";

/** 只有 2xx 才是「服务应答了」，其余状态码当作本次尝试失败。 */
function isSuccessStatus(status: number): boolean {
  return status >= 200 && status <= 299;
}

/**
 * 单次 TCP 握手：连上即视为可达，耗时取「发起 → 连接建立」。
 *
 * 超时用 destroy(error) 打断，让 `once(…, "connect")` 以同一个错误拒绝 ——
 * 于是超时、连接被拒与解析失败对调用方是同一种失败形态。
 */
export async function probeTcp({ host, port, timeoutMs }: TcpParameters): Promise<number> {
  const startedAt = Date.now();
  const link = createConnection({ host, port });
  const expiry = setTimeout(
    () => link.destroy(new Error(`tcp probe timeout ${host}:${port}`)),
    timeoutMs,
  );
  try {
    await once(link, "connect");
    return Date.now() - startedAt;
  } finally {
    clearTimeout(expiry);
    link.destroy();
  }
}

/**
 * 单次服务探测：读出 JSON 响应体交给 policy 判定。
 *
 * `parseResponse` 返回 `ok: false` 表示「连上了但不是目标服务」—— 这同样是一次
 * 失败尝试，因此以异常结束，由 targetLifecycle 计入 attemptCount 与 error。
 */
export async function probeHttp(
  params: ServiceParameters,
  policy: OwnerPolicy,
): Promise<{ latencyMs: number; marker?: string }> {
  const startedAt = Date.now();
  const payload = await readJsonPayload(params);
  const verdict = policy.parseResponse(payload);
  if (!verdict.ok) throw new Error(`service probe rejected ${params.url}`);
  const latencyMs = Date.now() - startedAt;
  return verdict.marker === undefined ? { latencyMs } : { latencyMs, marker: verdict.marker };
}

/** 发一次 GET：可选令牌头、2xx 校验、整段读完再解析 JSON。 */
async function readJsonPayload(params: ServiceParameters): Promise<unknown> {
  const response = await sendGet(params);
  if (!isSuccessStatus(response.statusCode ?? 0)) {
    throw new Error(`service probe status ${response.statusCode ?? 0} for ${params.url}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error(`service probe body is not JSON for ${params.url}`);
  }
}

/** 选择协议并发起请求，返回已到达的响应（此时响应体尚未读取）。 */
async function sendGet(params: ServiceParameters): Promise<IncomingMessage> {
  const endpoint = new URL(params.url);
  const send = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
  const call: ClientRequest = send(endpoint, {
    headers: params.token === undefined ? {} : { [TOKEN_HEADER]: params.token },
    method: "GET",
    signal: AbortSignal.timeout(params.timeoutMs),
  });
  call.end();
  const [response] = (await once(call, "response")) as [IncomingMessage];
  return response;
}
