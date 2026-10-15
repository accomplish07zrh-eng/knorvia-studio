// SPDX-License-Identifier: Apache-2.0
// 斜杠命令解析（B39）。
// /compact[ 指令]：无指令给 undefined（触发默认压缩），带非空指令给指令原文，非本命令给 null。
// /rewind 与 /fork 族：fork 无参/`latest` → fork，其余参数作检查点 id；rewind 无参/`status`/
// `help`/`-h` → status，`fork` 族同上，`cascade <scope> <id>` 命中消息回滚才转 cascade-message，
// `<scope> <id>` 消息回滚，`latest` → apply，其余参数作检查点 id。scope 同义表：conversation/
// message → 会话，code/workspace → 工作区，both → 两者。同步纯计算、不抛异常。
import { RewindScope } from "../../deps.js";
import type { MessageId } from "../../deps.js";
import type { ParsedRewindCommand } from "../../types.js";

// 命令前缀（逐字冻结）。
const COMPACT_COMMAND = "/compact";
const COMPACT_PREFIX = "/compact ";
const FORK_COMMAND = "/fork";
const FORK_PREFIX = "/fork ";
const REWIND_COMMAND = "/rewind";
const REWIND_PREFIX = "/rewind ";
const CASCADE_PREFIX = "cascade ";
const FORK_SUBCOMMAND = "fork ";
const FORK_SUBCOMMAND_NAME = "fork";
const LATEST_TARGET = "latest";

// 高频返回形状（冻结 action 值）。
const STATUS_ACTION: ParsedRewindCommand = { action: "status" };
const FORK_ACTION: ParsedRewindCommand = { action: "fork" };

// scope 同义表：conversation/message、code/workspace、both。
const REWIND_SCOPE_BY_ALIAS: Record<string, RewindScope> = {
  conversation: RewindScope.Conversation,
  message: RewindScope.Conversation,
  code: RewindScope.Workspace,
  workspace: RewindScope.Workspace,
  both: RewindScope.Both,
};

// /compact 解析：undefined = 默认压缩，null = 不是本命令。
export function parseCompactCommand(raw: string): string | undefined | null {
  const command = raw.trim();
  if (command === COMPACT_COMMAND) {
    return undefined;
  }
  if (!command.startsWith(COMPACT_PREFIX)) {
    return null;
  }
  const instructions = command.slice(COMPACT_PREFIX.length).trim();
  return instructions.length > 0 ? instructions : undefined; // 空说明按裸调用
}

// 消息回滚参数解析：恰好 `<scope> <id>` 两段才成立。
function parseMessageRewindArgs(rest: string): ParsedRewindCommand | null {
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return null;

  const resolvedScope = REWIND_SCOPE_BY_ALIAS[tokens[0]!];
  if (!resolvedScope) return null;

  return {
    action: "message",
    scope: resolvedScope,
    targetMessageId: tokens[1]! as MessageId,
  };
}

// /fork 参数解析：空参或 latest → 裸 fork，其余作检查点 id。
function parseForkCommandArgs(rest: string): ParsedRewindCommand {
  if (rest.length === 0 || rest === LATEST_TARGET) {
    return FORK_ACTION;
  }
  return { action: "fork", targetCheckpointId: rest }; // 检查点 id 分支
}

export function parseRewindCommand(raw: string): ParsedRewindCommand | null {
  const command = raw.trim();
  if (command === FORK_COMMAND) {
    return FORK_ACTION;
  }
  if (command.startsWith(FORK_PREFIX)) {
    return parseForkCommandArgs(command.slice(FORK_PREFIX.length).trim());
  }
  if (command === REWIND_COMMAND) {
    return STATUS_ACTION;
  }
  if (!command.startsWith(REWIND_PREFIX)) {
    return null;
  }

  const rest = command.slice(REWIND_PREFIX.length).trim();
  const isStatusAlias = rest.length === 0 || rest === "status" || rest === "help" || rest === "-h";
  if (isStatusAlias) {
    return STATUS_ACTION;
  }
  if (rest === FORK_SUBCOMMAND_NAME) {
    return FORK_ACTION;
  }
  if (rest.startsWith(FORK_SUBCOMMAND)) {
    return parseForkCommandArgs(rest.slice(FORK_SUBCOMMAND.length).trim());
  }
  if (rest.startsWith(CASCADE_PREFIX)) {
    const cascade = parseMessageRewindArgs(rest.slice(CASCADE_PREFIX.length).trim());
    if (cascade?.action === "message") {
      return { ...cascade, action: "cascade-message" }; // 级联回退分支
    }
  }
  const directMessage = parseMessageRewindArgs(rest);
  if (directMessage) return directMessage;
  if (rest === LATEST_TARGET) {
    return { action: "apply" }; // 最新检查点
  }

  return { action: "apply", targetCheckpointId: rest }; // 指定检查点
}
