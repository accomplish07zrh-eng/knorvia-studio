// SPDX-License-Identifier: Apache-2.0
import type {
  McpConnectionSnapshot,
  McpPort,
  McpToolCallResult,
  McpToolDescriptor,
} from "@knorvia/contracts";

// Windows Computer Use 的窄工具策略与传输上限：工具名、上限与错误文案都是兼容面。
const COMPUTER_USE_TOOL_NAMES: readonly string[] = [
  "computer_list_windows",
  "computer_request_access",
  "computer_observe",
  "computer_action",
  "computer_stop",
];
const TRUSTED_TOOL_NAMES = new Set<string>(COMPUTER_USE_TOOL_NAMES);
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;
const FRAME_LIMIT_MESSAGE = "Computer Use frame exceeds the single PNG image limit";
const TEXT_LIMIT_MESSAGE = "Computer Use result exceeds the text limit";
const SUBAGENT_DENIAL_MESSAGE = "Computer Use is unavailable to subagents";
const FRAME_MIME = "image/png";

const jsonBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");

const isTrustedTool = (
  descriptor: Pick<McpToolDescriptor, "serverName" | "toolName">,
  trustedServerNames: ReadonlySet<string> | undefined,
): boolean =>
  trustedServerNames?.has(descriptor.serverName) === true &&
  TRUSTED_TOOL_NAMES.has(descriptor.toolName);

/** 只有"受信 server 名单命中 + 精确工具名"同时成立才授予窄工具策略。 */
export function isTrustedWindowsComputerUseTool(
  descriptor: Pick<McpToolDescriptor, "serverName" | "toolName">,
  trustedServerNames?: ReadonlySet<string>,
): boolean {
  return isTrustedTool(descriptor, trustedServerNames);
}

/** 子代理借用普通 MCP 能力，但不继承窗口接管：受信工具从快照移除且调用被拒，其余原样透传。 */
export function restrictBorrowedWindowsComputerUse(
  borrowed: { port: McpPort; snapshot: McpConnectionSnapshot },
  trustedServerNames: ReadonlySet<string>,
): { port: McpPort; snapshot: McpConnectionSnapshot } {
  const snapshot: McpConnectionSnapshot = {
    ...borrowed.snapshot,
    tools: borrowed.snapshot.tools.filter((tool) => !isTrustedTool(tool, trustedServerNames)),
  };
  const port: McpPort = {
    close: () => borrowed.port.close(),
    connectConfiguredServers: (...args) => borrowed.port.connectConfiguredServers(...args),
    connectServer: (...args) => borrowed.port.connectServer(...args),
    disconnectServer: (...args) => borrowed.port.disconnectServer(...args),
    status: () => borrowed.port.status(),
    listTools: async () => [...snapshot.tools],
    callTool: async (request, options) => {
      if (isTrustedTool(request, trustedServerNames)) throw new Error(SUBAGENT_DENIAL_MESSAGE);
      return borrowed.port.callTool(request, options);
    },
  };
  return { snapshot, port };
}

/** 传输上限：至多一张 PNG 帧、帧字节与文本字节各有上限；通过时返回原对象（不缩放、不丢帧）。 */
export function preserveWindowsComputerUseFrames(result: McpToolCallResult): McpToolCallResult {
  let imageCount = 0;
  let textBytes = jsonBytes(result.structuredContent);
  for (const block of result.content) {
    if (block.type !== "image") {
      textBytes += jsonBytes(block);
      continue;
    }
    imageCount += 1;
    const data = block.data;
    const overSingleFrame =
      imageCount > 1 ||
      block.mimeType !== FRAME_MIME ||
      typeof data !== "string" ||
      data.length > Math.ceil(MAX_FRAME_BYTES / 3) * 4 ||
      Buffer.byteLength(data, "base64") > MAX_FRAME_BYTES;
    if (overSingleFrame) throw new Error(FRAME_LIMIT_MESSAGE);
  }
  if (textBytes > MAX_TEXT_BYTES) throw new Error(TEXT_LIMIT_MESSAGE);
  return result;
}
