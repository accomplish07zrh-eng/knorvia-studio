// SPDX-License-Identifier: Apache-2.0
// run lineage 字段的读法：主归约从进度载荷上搬运 resumedFrom / supersededBy 与停止原因时用的
// 两个窄读器。单独成文件，避免把主归约文件撑过行数门。两者的共同约定：载荷是别人发来的，可能
// 是旧 CLI 的退化形态或损坏数据，因此读不出一律按缺席返回，绝不让整帧被丢——缺一个键是退化，
// 不是错误。停止原因的白名单来自 workflow-observation-display 的词表，避免两处漂移。
//
// 实现上两个读器共用一个「取非空文本」的窄基元，停止原因再叠一层集合成员判定：词表在模块
// 加载时转成 Set 存一次，读器调用时只做一次 has 查询，不做类型断言式的数组扫描。
import { WORKFLOW_RUN_STOP_REASONS } from "./workflow-observation-display.js";
import type { WorkflowRunState } from "./workflow-runs.js";

const STOP_REASON_WORDS: ReadonlySet<string> = new Set<string>(WORKFLOW_RUN_STOP_REASONS);

/** 载荷上的文本字段：只有非空字符串算在场，其余（含空串）按缺席返回。 */
function payloadText(raw: unknown): string | undefined {
  return typeof raw === "string" && raw !== "" ? raw : undefined;
}

/** 载荷上的 run id 字段：非空字符串才算在场。 */
export function readRunIdField(raw: unknown): string | undefined {
  return payloadText(raw);
}

/** 载荷上的停止原因：白名单之外（老 CLI 不认识的新词、或损坏载荷）读作缺席。 */
export function readWorkflowRunStopReason(raw: unknown): WorkflowRunState["stopReason"] {
  const text = payloadText(raw);
  if (text === undefined || !STOP_REASON_WORDS.has(text)) return undefined;
  return text as WorkflowRunState["stopReason"];
}
