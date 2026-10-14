// SPDX-License-Identifier: Apache-2.0
// 运行时上下文的通用助手：定义解析、默认标识、时间戳包装、按键替换与取消转发。
import { randomUUID } from "node:crypto";
import { WorkflowDefinitionSchema, type WorkflowDefinition } from "@knorvia/contracts";
import { createExpertWorkflowDefinition } from "../definition.js";
import { safeRunIdSegment } from "./ids.js";
import type { ExpertWorkflowRuntimeDeps } from "./types.js";

/** 定义解析：注入的定义优先，否则用内置专家工作流定义（schema 校验后使用）。 */
export const resolveDefinition = (deps: ExpertWorkflowRuntimeDeps): WorkflowDefinition =>
  WorkflowDefinitionSchema.parse(deps.definition ?? createExpertWorkflowDefinition());

/** 默认时钟：未注入 now 时使用系统时间。 */
export const defaultClock = (): Date => new Date();

/** 默认活动 id：`act_` + UUID。 */
export const defaultActivityId = (): string => `act_${randomUUID()}`;

/** 默认运行 id：`wf_` + 净化后的工作流类型 + UUID，保证可作为文件名片段。 */
export const defaultRunIdFactory =
  (kind: string): (() => string) =>
  () =>
    `wf_${safeRunIdSegment(kind)}_${randomUUID()}`;

/** 统一时间戳：所有快照与日志都从这里取时间。 */
export const withTimestamp = <TValue extends { updatedAt: string }>(
  value: TValue,
  timestamp: string,
): TValue => ({ ...value, updatedAt: timestamp });

/** 按键替换列表项：先剔除同键项再追加，保证「后写覆盖先写」。 */
export const replaceByKey = <TItem>(
  list: readonly TItem[],
  keyOf: (item: TItem) => string,
  item: TItem,
): TItem[] => [...list.filter((entry) => keyOf(entry) !== keyOf(item)), item];

/** 取消转发：外部信号中止时，把原因（或兜底文案）转给内部控制器。 */
export const abortForwarder =
  (controller: AbortController, external: AbortSignal | undefined) => (): void => {
    const reason =
      external?.reason instanceof Error ? external.reason : new Error("Workflow aborted");
    controller.abort(reason);
  };
