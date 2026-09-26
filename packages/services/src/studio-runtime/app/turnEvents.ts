import { redactDiagnosticText } from "@knorvia/shared";
import type { StudioKernelEvent, StudioKernelId, StudioKernelUsage } from "../kernelTypes.js";
import type { StudioMessage } from "../types.js";
import type { StoredRun, StudioClock, StudioRepository } from "./storePort.js";
import { mergeKernelUsage } from "../domain/kernelUsage.js";

/**
 * 把内核事件写成 turn 记录。
 *
 * 从 `turnExecutor.ts` 拆出来只为让它留在架构策略的行数上限内；行为与所有者不变：
 * 写入者仍是拥有该 turn 的 owner，落库范围仍是 `run.targetId`。
 */
export function saveTurnEvent(
  db: StudioRepository,
  clock: StudioClock,
  run: StoredRun,
  turnId: string,
  kernel: StudioKernelId,
  event: Exclude<StudioKernelEvent, { type: "session" }>,
  stepId: string,
): void {
  if (event.type === "usage") {
    // 同一 turn 可先收到窗口、再收到计费用量；局部快照不能清空已有字段或重复累加。
    const previous = db.read<StudioKernelUsage>("usage", turnId);
    const usage = mergeKernelUsage(previous, event);
    if (JSON.stringify(previous) !== JSON.stringify(usage))
      db.write("usage", turnId, usage, run.id);
    return;
  }
  const id = `${turnId}:${event.type}${event.type === "tool" ? `:${event.id}` : ""}`;
  const old = db.read<StudioMessage>("message", id);
  const value = redactDiagnosticText(
    event.type === "tool" ? (event.output ?? event.input ?? "") : (old?.text ?? "") + event.text,
  );
  if (value.length > 1_000_000) throw new Error("单条输出超过保存限制，任务已停止");
  const now = clock.now();
  const hostPhase = event.type === "text" && /^group:(?:plan|review|steer|steering):/.test(stepId);
  const message: StudioMessage = {
    id,
    targetId: run.targetId,
    runId: run.id,
    turnId,
    sender: kernel,
    kind: hostPhase ? "tool" : event.type,
    text: value,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    ...(hostPhase
      ? { name: stepId.startsWith("group:review:") ? "主持人复核" : "主持人安排", state: "running" }
      : {}),
    ...(event.type === "tool" ? { name: event.name, state: event.state } : {}),
  };
  db.write("message", id, message, run.targetId);
}
