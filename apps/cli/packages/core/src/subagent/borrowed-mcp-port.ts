import type { McpConnectionSnapshot, McpPort } from "@knorvia/contracts";
import { SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE } from "./computer-use-policy.js";

interface BorrowedSubagentMcpAccess {
  port: McpPort;
  snapshot: McpConnectionSnapshot;
}

export function createBorrowedSubagentMcpAccess(
  parentPort: McpPort,
  parentStartupSnapshot: McpConnectionSnapshot,
  scopedServerNames?: readonly string[],
  deniedServerNames?: ReadonlySet<string>,
): BorrowedSubagentMcpAccess {
  const scope = scopedServerNames === undefined ? undefined : new Set(scopedServerNames);
  const isDenied = (serverName: string): boolean => deniedServerNames?.has(serverName) === true;
  const isInScope = /* 是否属于借用的 server */ (serverName: string): boolean =>
    (scope === undefined || scope.has(serverName)) && !isDenied(serverName);
  const statuses = Object.fromEntries(
    Object.entries(parentStartupSnapshot.statuses).filter(([serverName]) => isInScope(serverName)),
  );
  const connectedServerNames = /* 已连接的 server 名 */ new Set(
    Object.entries(statuses)
      .filter(([, status]) => status.status === "connected")
      .map(/* 取名字 */ ([serverName]) => serverName),
  );
  const snapshot: McpConnectionSnapshot = {
    statuses,
    tools: parentStartupSnapshot.tools.filter(
      (descriptor) =>
        isInScope(descriptor.serverName) && connectedServerNames.has(descriptor.serverName),
    ),
  };
  const rejectLifecycleMutation = /* 生命周期变更一律拒绝 */ (): never => {
    // child 借用 parent adapter，不拥有 MCP 连接生命周期。
    throw new Error("Subagent MCP port cannot mutate parent connection lifecycle");
  };

  return /* 只读端口视图 */ {
    snapshot,
    port: {
      async callTool(request, options) {
        if (isDenied(request.serverName)) {
          throw new Error(SUBAGENT_COMPUTER_USE_UNAVAILABLE_MESSAGE);
        }
        if (!connectedServerNames.has(request.serverName)) {
          throw new Error(`Subagent MCP server is outside visible scope: ${request.serverName}`);
        }
        return parentPort.callTool(request, options);
      },
      async close() /* 只读端口不实现关闭 */ {
        // child 结束时不向 parent adapter 传播 close。
      },
      async connectConfiguredServers() /* 只读端口不建连 */ {
        return /* 直接拒绝 */ rejectLifecycleMutation();
      },
      async connectServer() /* 只读端口不建连 */ {
        return /* 直接拒绝 */ rejectLifecycleMutation();
      },
      async disconnectServer() /* 只读端口不断开 */ {
        return /* 直接拒绝 */ rejectLifecycleMutation();
      },
      async listTools() /* 只读端口不列工具 */ {
        return [...snapshot.tools];
      },
      async status() {
        return /* 只读端口视图 */ { ...snapshot.statuses };
      },
    },
  };
}
