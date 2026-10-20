// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：CLI → Host 通知的唯一发射点。
//
// B14 要求「每个通知名都必须有明确触发点，禁止名字在但永不发」。因此本文件不存名字表，
// 只存**谁来发、发什么形状**；名字表在 method-table.ts，两处由 B14 的用例对齐。
//
// 本包拥有的触发点（其余通知归别的包，见 known-differences D8）：
//   - `plugins/operationProgress`：插件目录刷新等长操作开始时（B13）。
//   - `interaction/providerRuntimeHeadersCancelled`：供应商运行时 headers 请求中止/超时（B12）。

import { knorviaProtocolNotifications } from "@knorvia/shared";

/** 写一行的最小传输面：桥持有 stdout，本模块只表达「发什么」。 */
export interface NotificationSink {
  write(message: Readonly<Record<string, unknown>>): void;
}

/** `plugins/operationProgress` 的 state 词表（既有 `knorviaPluginOperationStateSchema`）。 */
export type PluginOperationState = "queued" | "running" | "refreshing" | "done" | "failed";

/** 通知发射器：桥持有 stdout，本模块只表达「发什么」。 */
export interface LegacyNotifier {
  pluginOperationProgress(operationId: string, state: PluginOperationState): void;
  providerRuntimeHeadersCancelled(input: {
    readonly workspace: unknown;
    readonly sessionId: string;
    readonly requestId: string;
  }): void;
}

/** 用桥的传输面建发射器；`transport` 缺席时全部降级为无操作（无客户端可通知）。 */
export function createLegacyNotifier(transport: NotificationSink | undefined): LegacyNotifier {
  const emit = (method: string, params: unknown): void => {
    transport?.write({ method, params });
  };
  return {
    pluginOperationProgress(operationId, state) {
      // B13：形状 `{ operationId, state }` 由共享 schema 冻结；不可合并、不可跳序。
      emit(knorviaProtocolNotifications.pluginOperationProgress, { operationId, state });
    },
    providerRuntimeHeadersCancelled(input) {
      // B12：中止/超时时**额外**发本通知，形状 `{workspace, sessionId, requestId}`。
      emit(knorviaProtocolNotifications.providerRuntimeHeadersCancelled, {
        workspace: input.workspace,
        sessionId: input.sessionId,
        requestId: input.requestId,
      });
    },
  };
}
