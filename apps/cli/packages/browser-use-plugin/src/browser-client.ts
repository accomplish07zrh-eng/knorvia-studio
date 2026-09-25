import { setupBrowserRuntime as attachBrowserClient } from "@knorvia/core/browser-client";
import { readNodeReplBrowserRuntimeBridge } from "@knorvia/node-repl-host/runtime-bridge";

/** 插件只负责连接宿主与现有 SDK；宿主决定当前调用是否可以操作浏览器。 */
export async function setupBrowserRuntime({
  globals,
}: {
  globals: Record<PropertyKey, unknown>;
}): Promise<void> {
  const connection = readNodeReplBrowserRuntimeBridge(globals);
  const assertAvailable = () => connection.assertAvailable();
  assertAvailable();
  attachBrowserClient({
    globals,
    documentationRoot: connection.documentationRoot,
    assertAvailable,
    transport: {
      list: () => {
        assertAvailable();
        return connection.list();
      },
      execute: (id, generation, command) => {
        assertAvailable();
        return connection.execute(id, generation, command);
      },
    },
  });
}
