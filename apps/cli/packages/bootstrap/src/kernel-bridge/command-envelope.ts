// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-01 段 A：v4/command 信封解析与 ACK 构造（合同 interface.md 第二～四节）
//
// 本文件只做三件事：
// 1. 把 stdin 收到的未知名值收窄为 CommandEnvelope（复用共享包既有 schema，禁止另立一套）；
// 2. 把边界失败归类为 v4 ACK 词表（proto.invalidPayload / proto.sessionNotFound / ...）；
// 3. 用固定键序构造 ACK 与 commands/query 结果，保证下行字节可重复。
//
// 裁决顺序与 CAS/幂等状态机在 command-inbox.ts；本文件不持有任何状态。

import {
  COMMANDS_REQUIRING_BASE_REVISION,
  ROW_TARGETING_COMMANDS,
  commandsQueryParamsSchema,
  commandsQueryResultSchema,
  parseCommandEnvelope,
  type CommandAck,
  type CommandEnvelope,
  type CommandQueryItem,
  type CommandsQueryParams,
  type CommandsQueryResult,
  type CommandType,
} from "@knorvia/shared/protocol-v4";
import type { z } from "zod";

/** v4 ACK 词表中由协议桥自身产生的 reasonCode；执行层 reasonCode 原样透传。 */
export const BRIDGE_REASON_CODES = {
  invalidPayload: "proto.invalidPayload",
  sessionNotFound: "proto.sessionNotFound",
  staleRevision: "proto.staleRevision",
  staleLogEpoch: "proto.staleLogEpoch",
} as const;

export type BridgeReasonCode = (typeof BRIDGE_REASON_CODES)[keyof typeof BRIDGE_REASON_CODES];

/** 信封解析结果：成功携带已校验 payload 的信封，失败携带可读诊断（不含 payload 正文）。 */
export type CommandEnvelopeParseResult =
  | { readonly ok: true; readonly envelope: CommandEnvelope }
  | { readonly ok: false; readonly message: string; readonly paths: readonly string[] };

/**
 * 解析 v4/command 参数。共享包的 parseCommandEnvelope 同时校验外壳、payload 与 CAS 字段，
 * 这里只把 zod 诊断压成单行文案，避免把原始 payload 写进 ACK。
 */
export function parseBridgeCommandEnvelope(value: unknown): CommandEnvelopeParseResult {
  try {
    const parsed = parseCommandEnvelope(value);
    if (parsed.ok) return { ok: true, envelope: parsed.envelope };
    return { ok: false, ...summarizeZodError(parsed.error) };
  } catch (error) {
    return { ok: false, message: errorMessage(error), paths: [] };
  }
}

/** 命令是否要求 CAS baseRevision（共享包词表，不得在桥内另抄一份名单）。 */
export function requiresBaseRevision(type: CommandType): boolean {
  return COMMANDS_REQUIRING_BASE_REVISION.has(type);
}

/** 命令是否按行定位（要求 baseLogEpoch）。 */
export function targetsRows(type: CommandType): boolean {
  return ROW_TARGETING_COMMANDS.has(type);
}

/** createSession 走全局幂等桶：{sessionId: null, commandId}。 */
export function isGlobalCommand(type: CommandType): boolean {
  return type === "createSession";
}

/** 构造一条 ACK；键序固定为 commandId → status → reasonCode → message → revisionAtDecision → result。 */
export function buildCommandAck(input: {
  readonly commandId: string;
  readonly status: CommandAck["status"];
  readonly revisionAtDecision: number;
  readonly reasonCode?: string;
  readonly message?: string;
  readonly result?: CommandAck["result"];
}): CommandAck {
  const ack: {
    commandId: string;
    status: CommandAck["status"];
    reasonCode?: string;
    message?: string;
    revisionAtDecision: number;
    result?: CommandAck["result"];
  } = {
    commandId: input.commandId,
    status: input.status,
    revisionAtDecision: input.revisionAtDecision,
  };
  if (input.reasonCode !== undefined) ack.reasonCode = input.reasonCode;
  if (input.message !== undefined) ack.message = input.message;
  if (input.result !== undefined) ack.result = input.result;
  return ack;
}

/** 信封解析失败：rejected + proto.invalidPayload + revisionAtDecision=0（B4/B7）。 */
export function invalidPayloadAck(
  commandId: string | undefined,
  diagnosis: { readonly message: string },
): CommandAck {
  return buildCommandAck({
    commandId: commandId ?? "",
    status: "rejected",
    reasonCode: BRIDGE_REASON_CODES.invalidPayload,
    message: diagnosis.message,
    revisionAtDecision: 0,
  });
}

/** 会话不存在：rejected + proto.sessionNotFound + revisionAtDecision=0（B7）。 */
export function sessionNotFoundAck(commandId: string, sessionId: string): CommandAck {
  return buildCommandAck({
    commandId,
    status: "rejected",
    reasonCode: BRIDGE_REASON_CODES.sessionNotFound,
    message: `Unknown session: ${sessionId}`,
    revisionAtDecision: 0,
  });
}

/** 行定位命令的 logEpoch 失配：stale + proto.staleLogEpoch + 当前 revision（B7）。 */
export function staleLogEpochAck(commandId: string, currentRevision: number): CommandAck {
  return buildCommandAck({
    commandId,
    status: "stale",
    reasonCode: BRIDGE_REASON_CODES.staleLogEpoch,
    revisionAtDecision: currentRevision,
  });
}

/** baseRevision 失配：stale + proto.staleRevision + 当前 revision（B5）。 */
export function staleRevisionAck(commandId: string, currentRevision: number): CommandAck {
  return buildCommandAck({
    commandId,
    status: "stale",
    reasonCode: BRIDGE_REASON_CODES.staleRevision,
    revisionAtDecision: currentRevision,
  });
}

/**
 * 回放首次终态为 duplicate（B6）：reasonCode / message / revisionAtDecision / result 全部取首次值，
 * 只有 status 改写为 duplicate。
 */
export function duplicateAck(commandId: string, settled: CommandAck): CommandAck {
  return buildCommandAck({
    commandId,
    status: "duplicate",
    revisionAtDecision: settled.revisionAtDecision,
    reasonCode: settled.reasonCode,
    message: settled.message,
    result: settled.result,
  });
}

export interface BridgeCommandsQueryInput {
  readonly commands: readonly { readonly sessionId: string | null; readonly commandId: string }[];
  readonly clock?: true;
}

/**
 * 校验 v4/commands/query 参数；失败返回 undefined，由调用方转协议 error（边界拒绝，不建缓存）。
 */
export function parseBridgeCommandsQuery(value: unknown): CommandsQueryParams | undefined {
  const parsed = commandsQueryParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * 组装 v4/commands/query 结果；`lookup` 返回 undefined 表示该 key 从未 settle → "unknown"。
 * 已 settle 的 key 一律回缓存 ACK，不得回退为 unknown（B3/B6）。
 */
export function buildCommandsQueryResult(
  params: CommandsQueryParams,
  lookup: (sessionId: string | null, commandId: string) => CommandAck | undefined,
): CommandsQueryResult {
  const results: CommandQueryItem[] = params.commands.map((key) => {
    const settled = lookup(key.sessionId, key.commandId);
    return {
      key: { sessionId: key.sessionId, commandId: key.commandId },
      result: settled ?? "unknown",
    };
  });
  const result: { results: CommandQueryItem[]; clock?: true } = { results };
  if (params.clock === true) result.clock = true;
  // 结果必须能通过共享包 schema；这里不吞错，让结构性错误在开发期立刻暴露。
  return commandsQueryResultSchema.parse(result);
}

/** 从任意失败值中提取可读文案：zod 诊断压成单行，其余用 Error.message。 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function summarizeZodError(error: z.ZodError): { message: string; paths: readonly string[] } {
  const issues = error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
  const paths = error.issues
    .map((issue) => issue.path.map((segment) => String(segment)).join("."))
    .filter((path) => path !== "");
  return { message: issues.join("; ") || "invalid command envelope", paths };
}

/** commandId 探测：信封整体非法时仍尽量保留客户端回传的 id，便于前端对号。 */
export function peekCommandId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const commandId = (value as { commandId?: unknown }).commandId;
  return typeof commandId === "string" && commandId !== "" ? commandId : undefined;
}
