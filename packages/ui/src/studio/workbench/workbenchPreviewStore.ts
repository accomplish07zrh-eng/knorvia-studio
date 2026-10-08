import { create } from "zustand";
import type { WorkbenchTile } from "./workbenchModel.js";

/**
 * 每格当前预览（specs/knorvia-workbench-artifact-preview-20261008.md）。
 * 只在渲染进程内存中，按 tile 键控并绑定 `kernel + sessionId`；不持久化，
 * 重载后由该格会话自己的产物重新得出，避免把旧 Host 或其他会话的页面带回来。
 */
export interface WorkbenchPreviewFile {
  url: string;
  title: string;
}
export interface WorkbenchPreviewEntry {
  binding: string;
  url: string;
  title: string;
  /** 可切换的同一产物来源（外部内核同一次运行改动的多个网页）。 */
  files: WorkbenchPreviewFile[];
  /** 每次打开递增，同一地址被重新生成时也会重新加载。 */
  revision: number;
}
interface Store {
  entries: Record<string, WorkbenchPreviewEntry>;
  open(
    tileId: string,
    binding: string,
    file: WorkbenchPreviewFile,
    files?: WorkbenchPreviewFile[],
  ): void;
  clear(tileId: string): void;
}

export function workbenchPreviewBinding(tile: Pick<WorkbenchTile, "kernel" | "sessionId">) {
  return `${tile.kernel}\u0000${tile.sessionId ?? ""}`;
}

/** 只把本地文件与本机服务地址放进格子预览；其他链接仍交给系统浏览器。 */
export function isWorkbenchPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") return /\.html?$/i.test(decodeURIComponent(parsed.pathname));
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export const useWorkbenchPreview = create<Store>((set, get) => ({
  entries: {},
  open(tileId, binding, file, files) {
    const previous = get().entries[tileId];
    const sameBinding = previous?.binding === binding;
    set({
      entries: {
        ...get().entries,
        [tileId]: {
          binding,
          url: file.url,
          title: file.title,
          files:
            files ??
            (sameBinding && previous.files.some((item) => item.url === file.url)
              ? previous.files
              : [file]),
          revision: (sameBinding ? previous.revision : 0) + 1,
        },
      },
    });
  },
  clear(tileId) {
    if (!get().entries[tileId]) return;
    const { [tileId]: _removed, ...rest } = get().entries;
    set({ entries: rest });
  },
}));
