import type { MessageBoxSyncOptions } from "electron";
import type { Locale } from "@knorvia/shared";

export function unsavedChangesDialogOptions(locale: Locale): MessageBoxSyncOptions {
  const isZh = locale === "zh-CN";
  return {
    type: "warning",
    title: isZh ? "草稿尚未保存" : "Unsaved draft",
    message: isZh ? "还有尚未保存的草稿，仍然关闭？" : "A draft has not been saved. Close anyway?",
    detail: isZh
      ? "留在应用可以继续编辑并保存草稿。仍然关闭可能丢失未保存的内容。"
      : "Stay to continue editing and save your draft. Closing may lose the unsaved content.",
    buttons: isZh ? ["留在应用", "仍然关闭"] : ["Stay in app", "Close anyway"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}

export function createUnsavedChangesGuard(options: {
  confirm: () => boolean;
  stay: () => void;
  onError: (error: unknown) => void;
}) {
  let confirming = false;
  return (event: { preventDefault(): void }) => {
    if (confirming) return;
    confirming = true;
    try {
      // Electron 此事件的 preventDefault 是忽略 renderer 阻止、允许卸载，方向与 DOM 相反。
      if (options.confirm()) event.preventDefault();
      else options.stay();
    } catch (error) {
      options.onError(error);
      options.stay();
    } finally {
      confirming = false;
    }
  };
}
