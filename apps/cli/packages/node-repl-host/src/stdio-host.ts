// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { NodeReplMcpRuntime } from "./mcp-runtime.js";
import {
  installNodeReplProcessGuards,
  installNodeReplShutdownTriggers,
} from "./process-lifecycle.js";

interface HostEnvironment {
  process: Pick<NodeJS.Process, "on" | "once">;
  stdin: Pick<NodeJS.ReadStream, "once">;
  writeStderr(text: string): void;
  exit(code: number): void;
}
const processEnvironment: HostEnvironment = {
  process,
  stdin: process.stdin,
  writeStderr: (text) => {
    process.stderr.write(text);
  },
  exit: (code) => {
    process.exit(code);
  },
};

/** The transport factory and process shutdown share one resource owner. */
export function startStdioHost(
  createRuntime: () => NodeReplMcpRuntime,
  host = processEnvironment,
): void {
  const instances = new Set<Promise<NodeReplMcpRuntime>>();
  let closing: Promise<void> | undefined;
  const transport = serveStdio(
    () => {
      if (closing) throw new Error("Execution host is closing");
      // 构造函数可能同步触发关闭；先登记构造，关闭快照才能包含尚未返回的实例。
      const construction = Promise.withResolvers<NodeReplMcpRuntime>();
      instances.add(construction.promise);
      void construction.promise.catch(() => {});
      let instance: NodeReplMcpRuntime;
      try {
        instance = createRuntime();
        construction.resolve(instance);
      } catch (error) {
        instances.delete(construction.promise);
        construction.reject(error);
        throw error;
      }
      if (closing) throw new Error("Execution host is closing");
      return instance.server;
    },
    { legacy: "reject" },
  );

  const shutdown = () => {
    if (closing) return;
    const barrier = Promise.withResolvers<void>();
    closing = barrier.promise;
    // 每项清理单独调度，避免一个同步异常跳过其他驱动；全部收尾后才关闭 stdio。
    const cleanup = [...instances].map((instance) => instance.then((runtime) => runtime.dispose()));
    void Promise.allSettled(cleanup)
      .then(() => transport.close())
      .catch(() => {})
      .then(() => {
        barrier.resolve();
        host.exit(0);
      });
  };
  installNodeReplProcessGuards({
    process: host.process,
    writeStderr: host.writeStderr,
    onOutputClosed: shutdown,
  });
  installNodeReplShutdownTriggers({ process: host.process, stdin: host.stdin, shutdown });
}
