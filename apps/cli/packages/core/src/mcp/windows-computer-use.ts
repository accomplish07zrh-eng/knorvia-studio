import type {
  McpConnectionSnapshot,
  McpPort,
  McpToolCallResult,
  McpToolDescriptor,
} from "@knorvia/contracts";

const WINDOWS_COMPUTER_USE_TOOLS: ReadonlySet<string> = new Set([
  "computer_list_windows",
  "computer_request_access",
  "computer_observe",
  "computer_action",
  "computer_stop",
]);
const WINDOWS_COMPUTER_USE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const WINDOWS_COMPUTER_USE_MAX_TEXT_BYTES = 64 * 1024;

/** 只有 bootstrap 的进程内来源证明与精确工具名同时成立才授予窄工具策略。 */
export function isTrustedWindowsComputerUseTool(
  descriptor: Pick<McpToolDescriptor, "serverName" | "toolName">,
  trustedServerNames?: ReadonlySet<string>,
): boolean {
  return (
    trustedServerNames?.has(descriptor.serverName) === true &&
    WINDOWS_COMPUTER_USE_TOOLS.has(descriptor.toolName)
  );
}

/** 子代理借用普通 MCP 能力，但不能继承主代理窗口接管；同一 host 的 js/browser 保留。 */
export function restrictBorrowedWindowsComputerUse(
  borrowed: { port: McpPort; snapshot: McpConnectionSnapshot },
  trustedServerNames: ReadonlySet<string>,
): { port: McpPort; snapshot: McpConnectionSnapshot } {
  const snapshot = {
    ...borrowed.snapshot,
    tools: borrowed.snapshot.tools.filter(
      (tool) => !isTrustedWindowsComputerUseTool(tool, trustedServerNames),
    ),
  };
  return {
    snapshot,
    port: {
      close: () => borrowed.port.close(),
      connectConfiguredServers: (...args) => borrowed.port.connectConfiguredServers(...args),
      connectServer: (...args) => borrowed.port.connectServer(...args),
      disconnectServer: (...args) => borrowed.port.disconnectServer(...args),
      status: () => borrowed.port.status(),
      async listTools() {
        return [...snapshot.tools];
      },
      async callTool(request, options) {
        if (isTrustedWindowsComputerUseTool(request, trustedServerNames)) {
          throw new Error("Computer Use is unavailable to subagents");
        }
        return borrowed.port.callTool(request, options);
      },
    },
  };
}

/** PNG 几何与观测身份由宿主校验；bridge 只守传输上限，绝不缩放或丢弃可操作帧。 */
export function preserveWindowsComputerUseFrames(result: McpToolCallResult): McpToolCallResult {
  let imageCount = 0;
  let textBytes = Buffer.byteLength(JSON.stringify(result.structuredContent ?? {}), "utf8");
  for (const block of result.content) {
    if (block.type !== "image") {
      textBytes += Buffer.byteLength(JSON.stringify(block), "utf8");
      continue;
    }
    imageCount += 1;
    if (
      imageCount > 1 ||
      block.mimeType !== "image/png" ||
      typeof block.data !== "string" ||
      block.data.length > Math.ceil(WINDOWS_COMPUTER_USE_MAX_IMAGE_BYTES / 3) * 4 ||
      Buffer.byteLength(block.data, "base64") > WINDOWS_COMPUTER_USE_MAX_IMAGE_BYTES
    ) {
      throw new Error("Computer Use frame exceeds the single PNG image limit");
    }
  }
  if (textBytes > WINDOWS_COMPUTER_USE_MAX_TEXT_BYTES) {
    throw new Error("Computer Use result exceeds the text limit");
  }
  return result;
}
