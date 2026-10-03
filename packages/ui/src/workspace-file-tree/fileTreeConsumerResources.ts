// SPDX-License-Identifier: Apache-2.0
// Source-exposed resource/request candidates; source and runtime review pending.
import type { EditorInfo } from "@knorvia/shared";
import { sortInstalledEditorsForOpenWith } from "@/lib/openWithEditors.js";

const dragEndSignals = ["dragend", "drop", "blur"] as const;

/** React owns the boolean; this lease only owns callbacks/listeners for one true interval. */
export function observeFileTreeDragEnd(target: Window, ended: () => void): () => void {
  const listeners: string[] = [];
  let active = true;
  const receive = () => {
    if (active) ended();
  };
  const release = () => {
    if (!active) return;
    active = false;
    let failed = false,
      failure: unknown;
    for (const type of listeners.splice(0)) {
      try {
        target.removeEventListener(type, receive);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  };
  try {
    for (const type of dragEndSignals) {
      listeners.push(type);
      target.addEventListener(type, receive);
    }
  } catch (error) {
    // 安装中途抛错时 React 得不到 cleanup；先释放本 lease 已登记的监听再抛原错。
    try {
      release();
    } catch {
      /* preserve the installation failure */
    }
    throw error;
  }
  return release;
}

type EditorPlatform = { getInstalledEditors: () => Promise<EditorInfo[]> };

/** No duplicate editor data: one permission controls writes into the existing React array. */
export class InstalledFileTreeEditorRequests {
  private current: object | null = null;

  constructor(
    private readonly ports: {
      accept: (editors: EditorInfo[]) => void;
      failed: (error: unknown) => void;
    },
  ) {}

  begin(platform: EditorPlatform): () => void {
    const permission = {};
    this.current = permission;
    const release = () => {
      if (this.current === permission) this.current = null;
    };
    try {
      void platform
        .getInstalledEditors()
        .then((editors) => {
          if (this.current === permission)
            this.ports.accept(sortInstalledEditorsForOpenWith(editors));
        })
        .catch((error) => this.ports.failed(error));
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
}
