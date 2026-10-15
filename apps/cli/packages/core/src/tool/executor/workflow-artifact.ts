// SPDX-License-Identifier: Apache-2.0
// 工作流报告的模型面片段：把脚本发布的报告渲染成「通知行」与「清单行」两种投影。
//
// 两个入口都只做「序列化 + 截断 + 限量」：不解析内容、不改结构、不抛错。
// 通知面按字节预算累计，第一行无论多长都保留——否则会出现「有报告却一条都不显示」。
// 清单面固定取前若干条，每条有独立的截断上限。

import { serializeWorkflowArtifact } from "@knorvia/contracts";

export { serializeWorkflowArtifact };

type ReportItem = unknown;

interface WorkflowReportsSection {
  readonly count: number;
  readonly shown: number;
  readonly preview: string;
}

interface WorkflowReportsManifestSection {
  readonly count: number;
  readonly shown: number;
  readonly preview: readonly string[];
}

const NOTIFICATION_ITEM_BUDGET = 2_000;
const NOTIFICATION_TOTAL_BUDGET = 8_000;
const MANIFEST_ITEM_BUDGET = 500;
const MANIFEST_MAX_ITEMS = 8;
const ELLIPSIS = "…";

function reportText(item: ReportItem, maximum: number): string {
  const serialized = serializeWorkflowArtifact(item) ?? "";
  if (serialized.length <= maximum) return serialized;
  return serialized.slice(0, maximum - 1) + ELLIPSIS;
}

export function buildWorkflowReportsNotificationSection(
  items: readonly ReportItem[] | undefined,
): WorkflowReportsSection | undefined {
  if (items === undefined || items.length === 0) return undefined;

  const collected: string[] = [];
  let chargedBytes = 0;
  for (const [position, item] of items.entries()) {
    const rendered = `[${position + 1}] ${reportText(item, NOTIFICATION_ITEM_BUDGET)}`;
    const cost = rendered.length + 1;
    const overBudget = collected.length > 0 && chargedBytes + cost > NOTIFICATION_TOTAL_BUDGET;
    if (overBudget) break;
    collected.push(rendered);
    chargedBytes += cost;
  }
  return { count: items.length, shown: collected.length, preview: collected.join("\n") };
}

export function buildWorkflowReportsManifestSection(
  items: readonly ReportItem[] | undefined,
): WorkflowReportsManifestSection | undefined {
  if (items === undefined || items.length === 0) return undefined;
  const preview = items
    .slice(0, MANIFEST_MAX_ITEMS)
    .map((item) => reportText(item, MANIFEST_ITEM_BUDGET));
  return { count: items.length, shown: preview.length, preview };
}
