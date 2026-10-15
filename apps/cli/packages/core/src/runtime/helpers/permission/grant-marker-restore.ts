// SPDX-License-Identifier: Apache-2.0
// 会话恢复时的授权标记回填（B15）。
// 恢复路径只做一件事：把「最后一条 full-access 授权条目」的 interactionId 回填到运行时的
// lastPermissionGrantId。回执只是辅助标记——条目格式损坏或会话对不上都不能阻断历史与执行
// 状态恢复，只记一条 warn 放弃回填；会话存储抛错向上冒泡，由调用方处理。先清空再按最后一条
// 重建，重复执行结果相同。
import {
  PERMISSION_FULL_ACCESS_ENTRY,
  permissionFullAccessReceiptSchema,
  traceContextToLogContext,
} from "@knorvia/contracts";
import type { TraceContext } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../../internal.js";

// 放弃回填时的 warn 文案与事件名（观测契约，逐字冻结）。
const INVALID_GRANT_NOTICE = "Ignoring invalid permission grant marker during session resume";
const INVALID_GRANT_EVENT = "session.resume.permission_grant_invalid";

// 放弃回填的告警：条目 id 与原因都进结构化字段，供恢复排障定位。
function warnInvalidGrantMarker(
  host: AgentRuntimeInternal,
  trace: TraceContext,
  entryId: string,
  reason: "invalid_receipt" | "session_mismatch",
): void {
  const context = {
    ...traceContextToLogContext(trace),
    event: INVALID_GRANT_EVENT,
    module: "core.runtime", // 模块归属是观测契约字段
    entryId,
    reason,
  };
  host.logger?.warn(INVALID_GRANT_NOTICE, context);
}

export const restorePermissionGrantMarker = async (
  host: AgentRuntimeInternal,
  trace: TraceContext,
): Promise<void> => {
  // 先清空旧标记：回填是「按最后一条重建」，旧值不参与。
  host.lastPermissionGrantId = undefined;

  // 条目只读一次（幂等边界）：取该会话的最后一条 full-access 授权条目。
  const entries = await host.sessionStore?.sessionEntries?.({
    sessionID: host.sessionId,
    type: PERMISSION_FULL_ACCESS_ENTRY,
  });
  const latest = entries ? entries[entries.length - 1] : undefined;
  if (latest === undefined) return;

  const parsed = permissionFullAccessReceiptSchema.safeParse(latest.data);
  const usable = parsed.success && parsed.data.event.sessionId === host.sessionId;
  if (!usable) {
    // 格式损坏或会话不一致：告警后放弃回填，标记保持清空。
    warnInvalidGrantMarker(
      host,
      trace,
      latest.id,
      parsed.success ? "session_mismatch" : "invalid_receipt",
    );
    return;
  }
  host.lastPermissionGrantId = parsed.data.interactionId;
};
