// SPDX-License-Identifier: Apache-2.0

import type { KnorviaMessageWithParts } from "./protocol-legacy-types.js";
import { textFromKnorviaMessageParts } from "./protocol-legacy-types.js";

// 通知有效载荷结构定义
export interface KnorviaBackgroundTaskNotificationInfo {
  readonly result?: /* 结果输出内容 */ string;
  readonly status?: /* 作业退出状态 */ string;
  readonly summary?: /* 摘要总结文案 */ string;
  readonly taskId?: /* 关联任务 ID */ string;
  readonly outputFile?: /* 产出文件路径 */ string;
  readonly error?: /* 错误提示信息 */ string;
}

// 工具调用更新目标三态字面量类型
type TaskToolUpdateStatus = "completed" | "failed" | "stopped";

// 状态映射表：明确中断与失败语义，防止将任务异常提前标记为已完成
const NOTIFICATION_STATUS_LOOKUP: Readonly<Record<string, TaskToolUpdateStatus>> = {
  failed: "failed",
  lost: "failed",
  stopped: "stopped",
  killed: "stopped",
};

// 将后台状态转换为工具调用更新状态（中止态不得映射为完成）
export function knorviaBackgroundTaskNotificationToolUpdateStatus(
  statusText: string | undefined,
): TaskToolUpdateStatus {
  if (statusText && statusText in NOTIFICATION_STATUS_LOOKUP) {
    return NOTIFICATION_STATUS_LOOKUP[statusText]!;
  }
  return "completed";
}

// 安全转换非数组普通对象，无法转换时返回空对象
function extractObjectShallowCopy(source: unknown): Record<string, unknown> {
  if (source && typeof source === "object" && !Array.isArray(source)) {
    return Object.assign({}, source as Record<string, unknown>);
  }
  return {};
}

// 将后台通知信息附加到 raw 消息对象的 _meta.knorvia.taskNotification 层级
export function attachKnorviaBackgroundTaskNotificationToRaw(
  rawPayload: unknown,
  notificationItem: KnorviaBackgroundTaskNotificationInfo | undefined,
): unknown {
  if (!notificationItem) {
    return rawPayload;
  }

  const container = extractObjectShallowCopy(rawPayload);
  const existingMeta = extractObjectShallowCopy(container._meta);
  const existingKnorvia = extractObjectShallowCopy(existingMeta.knorvia);

  existingKnorvia.taskNotification = notificationItem;
  existingMeta.knorvia = existingKnorvia;
  container._meta = existingMeta;

  return container;
}

// 抽取并解码 XML 标签内部文本，注意：&amp; 必须在最后一步反转以防止二次转义
function readXmlTagContent(xmlSource: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "u").exec(xmlSource);
  const textBody = match?.[1]?.trim();
  if (!textBody) {
    return /* 空标签或未命中 */ undefined;
  }

  // 实体反转顺序敏感：引号与尖括号优先，与号置于末尾
  return textBody
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// 解析通知文本，获取通知详情及关联的 tool-use-id
export function parseKnorviaBackgroundTaskNotificationText(
  xmlCandidate: string | undefined,
): {
  readonly toolUseId: string;
  readonly notification: KnorviaBackgroundTaskNotificationInfo;
} | null {
  const text = xmlCandidate?.trim();
  if (!text || !text.startsWith("<task-notification>")) {
    return /* 缺少合法前缀标签 */ null;
  }

  const linkedId = readXmlTagContent(text, "tool-use-id");
  if (!linkedId) {
    return /* 缺少关联 toolUseId 标记 */ null;
  }

  // 统一解包 6 项字段，即使缺省也保证 key 存在
  const builtNotification: KnorviaBackgroundTaskNotificationInfo = {
    error: readXmlTagContent(text, "error"),
    outputFile: readXmlTagContent(text, "output-file"),
    result: readXmlTagContent(text, "result"),
    status: readXmlTagContent(text, "status"),
    summary: readXmlTagContent(text, "summary"),
    taskId: readXmlTagContent(text, "task-id"),
  };

  return {
    toolUseId: linkedId,
    notification: builtNotification,
  };
}

// 从用户消息序列中汇集所有后台任务通知
export function collectKnorviaBackgroundTaskNotificationsByToolUseId(
  messageList: readonly KnorviaMessageWithParts[],
): Map<string, KnorviaBackgroundTaskNotificationInfo> {
  return messageList.reduce((accMap, msgItem) => {
    if (msgItem.info.role === "user") {
      const wholeText = textFromKnorviaMessageParts(msgItem.parts);
      const parsed = parseKnorviaBackgroundTaskNotificationText(wholeText);
      if (parsed) {
        accMap.set(parsed.toolUseId, parsed.notification);
      }
    }
    return accMap;
  }, new Map<string, KnorviaBackgroundTaskNotificationInfo>());
}
