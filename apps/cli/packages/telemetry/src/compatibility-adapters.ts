// SPDX-License-Identifier: Apache-2.0
// 外部语义约定的投影点。
//
// `knorvia.*` 是内部查询的权威字段；GenAI / HTTP / Server 这些标准键只用于让外部分析工具
// 认出同一次调用。做法统一：先按字段表收集候选，再由 `emit` 一次性过滤。
//
// 入参形状写成紧凑的 type 别名（不展开成多行 interface）：它们只是 Writer 侧的调用契约，
// 展开成逐字段一行会让文件大半是字段声明本身。
import type { Attributes } from "@opentelemetry/api";
import type { ResolvedModelTelemetryDescriptor } from "@knorvia/contracts/telemetry";
import { httpUrlOf } from "./gates.js";
import { integer, safeEnum, safeId, safeIdentifier, safeString } from "./gates.js";

/** 工具执行的入参。 */
export type ToolCompatibilityInput = { toolCallId: string; toolName: string };

/** 命令执行的入参。 */
export type CommandCompatibilityInput = { exitCode?: number; signal?: string };

/** 模型响应的入参。 */
export type ModelResponseCompatibilityInput = {
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  responseModel?: string;
};

/** 一条标准键的候选值；undefined 表示本次不写。 */
type Candidate = readonly [key: string, value: Attributes[string] | undefined];

/** 候选表 → Attribute：丢掉 undefined 与空串。 */
function emit(candidates: readonly Candidate[]): Attributes {
  const attributes: Attributes = {};
  for (const [key, value] of candidates) {
    if (value === undefined || value === "") continue;
    attributes[key] = value;
  }
  return attributes;
}

/** 工具执行：操作名固定，调用 id 与工具名各自过闸门。 */
export function toolCompatibilityAttributes(input: ToolCompatibilityInput): Attributes {
  return emit([
    ["gen_ai.operation.name", "execute_tool"],
    ["gen_ai.tool.call.id", safeId(input.toolCallId)],
    ["gen_ai.tool.name", safeString(input.toolName, 128)],
  ]);
}

/** 命令执行：退出码与信号。 */
export function commandCompatibilityAttributes(input: CommandCompatibilityInput): Attributes {
  return emit([
    ["process.exit.code", integer(input.exitCode)],
    ["process.signal.name", safeIdentifier(input.signal)],
  ]);
}

/** 模型请求：供应商、请求模型与服务器端点。 */
export function modelAttemptCompatibilityAttributes(
  target: ResolvedModelTelemetryDescriptor,
): Attributes {
  const endpoint = endpointOf(target.providerOrigin);
  return emit([
    ["gen_ai.provider.name", safeEnum(target.providerKind)],
    ["gen_ai.request.model", safeString(target.requestedModel, 128)],
    ["server.address", endpoint.address],
    ["server.port", endpoint.port],
  ]);
}

/** 模型响应：结束原因（单元素数组）、响应模型与 token 用量。 */
export function modelResponseCompatibilityAttributes(
  input: ModelResponseCompatibilityInput,
): Attributes {
  const reason = safeString(input.finishReason, 128);
  return emit([
    ["gen_ai.response.finish_reasons", reason === undefined ? undefined : [reason]],
    ["gen_ai.response.model", safeString(input.responseModel, 128)],
    ["gen_ai.usage.input_tokens", integer(input.inputTokens)],
    ["gen_ai.usage.output_tokens", integer(input.outputTokens)],
  ]);
}

/** HTTP 响应状态码。 */
export function httpResponseCompatibilityAttributes(statusCode: number): Attributes {
  return emit([["http.response.status_code", integer(statusCode)]]);
}

/** 默认端口表：没有显式端口时按协议补。 */
const DEFAULT_PORTS: Readonly<Record<string, number>> = { "http:": 80, "https:": 443 };

/** origin → 主机名与端口；解析失败或非 http(s) 时两个字段都空。 */
function endpointOf(origin: string | undefined): { address?: string; port?: number } {
  const parsed = httpUrlOf(origin);
  if (parsed === undefined) return {};
  const address = safeString(parsed.hostname);
  if (parsed.port) return { address, port: integer(Number(parsed.port)) };
  return { address, port: DEFAULT_PORTS[parsed.protocol] };
}
