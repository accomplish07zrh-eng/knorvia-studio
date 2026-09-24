import type { StudioCommand, StudioRun } from "@knorvia/services";
import type { StudioGroup } from "./groupModel.js";

type CommandInput = StudioCommand extends infer C
  ? C extends StudioCommand
    ? Omit<C, "commandId">
    : never
  : never;

export function activeGroupRun(runs: StudioRun[] = []): StudioRun | undefined {
  return (
    runs.find((run) => ["running", "waiting"].includes(run.state)) ??
    runs.find((run) => run.state === "queued")
  );
}

/** Clearing input is acknowledgement-driven; a late reply must not erase newly typed text. */
export async function submitGroupDraft({
  group,
  active,
  command,
  currentDraft,
  clearDraft,
  canSubmit = () => true,
}: {
  group: StudioGroup;
  active?: StudioRun;
  command: (input: CommandInput) => Promise<unknown>;
  currentDraft: () => string;
  clearDraft: (submitted: string) => void;
  canSubmit?: () => boolean;
}) {
  const text = currentDraft();
  if (!text.trim() || !group.workspacePath || active?.cancelRequested || !canSubmit()) return false;
  if (active?.taskMode && ["queued", "running", "waiting"].includes(active.state)) {
    await command({ type: "steer", runId: active.id, text });
  } else {
    const { draft: _draft, ...definition } = group;
    await command({ type: "save-group", group: definition });
    // 保存期间用户可能点了停止；旧发送不能在停止之后启动新一轮群任务。
    if (!canSubmit()) return false;
    await command({
      type: "send",
      kind: "group",
      targetId: group.id,
      text,
      taskMode: group.mode === "task",
    });
  }
  if (currentDraft() === text) clearDraft(text);
  return true;
}
