// SPDX-License-Identifier: Apache-2.0
import type { McpToolDescriptor } from "@knorvia/contracts";

// 模型可见 MCP 名称的构造与匹配：前缀、分隔符与占位词都是兼容面，改动会改协议面。
const MODEL_VISIBLE_PREFIX = "mcp";
const NAME_PART_SEPARATOR = "__";
const UNKNOWN_NAME_PART = "unknown";
const DISALLOWED_NAME_CHARACTERS = /[^a-zA-Z0-9_-]/gu;
const REPEATED_UNDERSCORES = /_+/gu;

/** 单段名称清洗：非法字符折成下划线、连续下划线压成一个；整段为空时用 `unknown` 占位。 */
export const toModelVisibleMcpNamePart = (name: string): string => {
  const sanitized = name.replace(DISALLOWED_NAME_CHARACTERS, "_").replace(REPEATED_UNDERSCORES, "_");
  return sanitized === "" ? UNKNOWN_NAME_PART : sanitized;
};

/** 模型可见工具名：descriptor 已给 `name` 就沿用，否则拼 `mcp__<server>__<tool>`。 */
export const toMcpToolName = (
  descriptor: Pick<McpToolDescriptor, "name" | "serverName" | "toolName">,
): string => {
  if (descriptor.name !== undefined && descriptor.name !== null) return descriptor.name;
  return [
    MODEL_VISIBLE_PREFIX,
    toModelVisibleMcpNamePart(descriptor.serverName),
    toModelVisibleMcpNamePart(descriptor.toolName),
  ].join(NAME_PART_SEPARATOR);
};

/** 服务名匹配：去首尾空白并小写后，原始或清洗形式满足相等或包含即为真；空查询恒假。 */
export const matchesModelVisibleMcpServerName = (
  requiredName: string,
  serverName: string,
): boolean => {
  const expected = requiredName.trim().toLowerCase();
  if (expected === "") return false;
  const candidates = [
    serverName.trim().toLowerCase(),
    toModelVisibleMcpNamePart(serverName).toLowerCase(),
  ];
  return candidates.some(
    (candidate) => candidate === expected || candidate.includes(expected),
  );
};
