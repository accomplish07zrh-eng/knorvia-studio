import type { KeyboardEvent } from "react";

/** 画布快捷键：Ctrl/⌘+S 保存；输入框外 Ctrl/⌘+Z 撤销、Shift+Z 或 Y 重做。 */
export function handleWorkflowShortcut(
  event: KeyboardEvent,
  actions: { save: () => void; undo: () => void; redo: () => void; editingDisabled: boolean },
): void {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    event.stopPropagation();
    actions.save();
    return;
  }
  if ((event.target as HTMLElement).closest("input,textarea,[contenteditable='true']")) return;
  if (key === "z" && !actions.editingDisabled) {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) actions.redo();
    else actions.undo();
  }
  if (key === "y" && !actions.editingDisabled) {
    event.preventDefault();
    event.stopPropagation();
    actions.redo();
  }
}
