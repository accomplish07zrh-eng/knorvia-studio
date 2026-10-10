import { redactDiagnosticText } from "@knorvia/shared";
import type { StudioKernelEvent, StudioKernelId, StudioKernelUsage } from "../kernelTypes.js";
import type { StudioMessage } from "../types.js";
import type { StoredRun, StudioClock, StudioRepository } from "./storePort.js";
import { mergeKernelUsage } from "../domain/kernelUsage.js";
import { fingerprint } from "../domain/kernelMedia.js";
import type { StudioKernelMedia } from "../kernelTypes.js";

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
  if (event.type === "media") return saveTurnMedia(db, clock, run, turnId, kernel, event.items);
  const id = `${turnId}:${event.type}${event.type === "tool" ? `:${event.id}` : ""}`;
  const old = db.read<StudioMessage>("message", id);
  const details: Pick<StudioMessage, "input" | "output" | "content" | "statusDetail"> = {};
  if (event.type === "tool") {
    // 旧 text 不猜成 output；新字段独立合并，只有明确传入的空值才能清空旧值。
    for (const key of ["input", "output", "content", "statusDetail"] as const) {
      const field = event[key] ?? old?.[key];
      if (field !== undefined) details[key] = redactDiagnosticText(field);
    }
    if (Object.values(details).reduce((size, value) => size + value.length, 0) > 1_000_000)
      throw new Error("工具详情超过保存限制，任务已停止");
  }
  const value = redactDiagnosticText(
    event.type === "tool"
      ? (details.output ?? details.content ?? details.input ?? event.legacyText ?? old?.text ?? "")
      : (old?.text ?? "") + event.text,
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
    ...(event.type === "tool" ? { name: event.name, state: event.state, ...details } : {}),
  };
  db.write("message", id, message, run.targetId);
}

/**
 * 内核产出的媒体：每个位置一条 `media` 消息（specs/knorvia-kernel-native-media-20261010.md）。
 * 消息 ID 由 turn 与位置构成，工具多次更新同一结果时幂等；只保存引用，不保存字节。
 */
function saveTurnMedia(
  db: StudioRepository,
  clock: StudioClock,
  run: StoredRun,
  turnId: string,
  kernel: StudioKernelId,
  items: StudioKernelMedia[],
): void {
  for (const item of items) {
    const { dataBase64: _inline, ...ref } = item;
    // 未落盘的内联内容不进数据库，只保留名称与超限标记。
    const media =
      _inline !== undefined && !ref.uri ? { ...ref, omitted: "too-large" as const } : ref;
    const id = `${turnId}:media:${fingerprint(media.uri ?? `${media.name ?? ""}:${media.kind}`)}`;
    if (db.read<StudioMessage>("message", id)) continue;
    const now = clock.now();
    const message: StudioMessage = {
      id,
      targetId: run.targetId,
      runId: run.id,
      turnId,
      sender: kernel,
      kind: "media",
      text: redactDiagnosticText(media.name ?? media.uri ?? media.kind),
      media: [media],
      createdAt: now,
      updatedAt: now,
    };
    db.write("message", id, message, run.targetId);
  }
}
