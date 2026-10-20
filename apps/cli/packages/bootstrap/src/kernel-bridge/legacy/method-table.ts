// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：74 个旧协议方法的方向表。
//
// 表的唯一事实来源是 @knorvia/shared 的 `knorviaProtocolMethods`；本文件只补「方向」与
// 「谁执行」两个维度，不改名、不增删。合同 README §二 的 74 = 59 + 14 + 1 由这里的
// 三张表相加得出，B9 直接断言这三张表的规模。

import { knorviaProtocolMethods } from "@knorvia/shared";

/**
 * 回合类方法：执行语义依赖 DSH 回合栈，由 kernel-bridge-02/03 通过执行端口提供。
 * 端口未注册时按 B10 返回 capability 缺席（D5 临时态，kernel-switch 前必须关闭）。
 */
export const PORT_BACKED_METHODS: ReadonlySet<string> = new Set([
  knorviaProtocolMethods.sessionResume,
  knorviaProtocolMethods.sessionSubscribe,
  knorviaProtocolMethods.sessionSend,
  knorviaProtocolMethods.sessionStop,
  knorviaProtocolMethods.sessionCancelBackgroundTask,
  knorviaProtocolMethods.sessionFork,
  knorviaProtocolMethods.sessionCompact,
  knorviaProtocolMethods.sessionGoal,
  knorviaProtocolMethods.sessionSetModel,
  knorviaProtocolMethods.sessionSetThoughtLevel,
  knorviaProtocolMethods.sessionSetMode,
  knorviaProtocolMethods.sessionClose,
]);

/**
 * CLI → Host 方向的方法：客户端把它当请求发来必须回 -32601（B8 / L4）。
 * 这些方法不在客户端方向上被应答，因此也不进 `CLIENT_METHODS`。
 */
export const HOST_DIRECTED_METHODS: ReadonlySet<string> = new Set([
  knorviaProtocolMethods.sessionRequestRuntimePreferences,
  knorviaProtocolMethods.automationCreate,
  knorviaProtocolMethods.automationUpdate,
  knorviaProtocolMethods.automationCheckTaskBinding,
  knorviaProtocolMethods.automationList,
  knorviaProtocolMethods.automationDelete,
  knorviaProtocolMethods.offPeakCreate,
  knorviaProtocolMethods.offPeakList,
  knorviaProtocolMethods.interactionRequestPermission,
  knorviaProtocolMethods.interactionRequestUserInput,
  knorviaProtocolMethods.interactionRequestProviderRuntimeHeaders,
  knorviaProtocolMethods.interactionRequestOfficialMcpAuthHeaders,
  knorviaProtocolMethods.interactionBrowserList,
  knorviaProtocolMethods.interactionBrowserExecute,
]);

/** 借用方法名的 CLI → Host 通知（B15）；客户端方向同样是 -32601。 */
export const COMPUTER_USE_OPERATION_EVENT = knorviaProtocolMethods.computerUseOperationEvent;

/** 7 个服务端通知名（B14）。`startup/storageState` 在新运行时按 D1 缺席。 */
export const SERVER_NOTIFICATIONS = [
  "startup/storageState",
  "interaction/providerRuntimeHeadersCancelled",
  "process/mcpTelemetry",
  "process/mcpResourceSamples",
  "process/toolExecResource",
  "plugins/operationProgress",
  "process/resourceSample",
] as const;

/**
 * 客户端方向方法：必须被应答，永不 -32601（B5 / L3）。
 * 从 `knorviaProtocolMethods` 的全量表里减掉 Host 方向 14 个与借名通知 1 个。
 */
export const CLIENT_METHODS: readonly string[] = Object.values(knorviaProtocolMethods).filter(
  (method) => !HOST_DIRECTED_METHODS.has(method) && method !== COMPUTER_USE_OPERATION_EVENT,
);

/** 方法总数（74），由 shared 表推导，不写死数字以外的事实。 */
export const LEGACY_METHOD_TOTAL = Object.keys(knorviaProtocolMethods).length;

/** 是否是旧协议方法名（含 Host 方向与借名通知：属协议面，不是「未知方法」）。 */
export function isLegacyMethodName(method: string): boolean {
  return Object.values(knorviaProtocolMethods).includes(
    method as (typeof knorviaProtocolMethods)[keyof typeof knorviaProtocolMethods],
  );
}

/** 是否客户端方向（会被本包应答）。 */
export function isClientMethod(method: string): boolean {
  return CLIENT_METHODS.includes(method);
}
