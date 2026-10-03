// SPDX-License-Identifier: Apache-2.0
// Source-exposed registration/preview owner; source and runtime review pending.
import type { PaneSplitSide } from "./paneLayoutTree.js";
import { resolveWorkbenchDropSide, type WorkbenchSessionDragPayload } from "./workbenchDragDrop.js";

export interface WorkbenchPointerDropTargetController {
  canDrop?: (payload: WorkbenchSessionDragPayload) => boolean;
  onDrop: (side: PaneSplitSide, payload: WorkbenchSessionDragPayload) => void;
  onPreview: (side: PaneSplitSide | null) => void;
}

type Target = { element: HTMLElement; controller: WorkbenchPointerDropTargetController };
type Lease = { key: object; target: Target };
type Hit = Lease & { side: PaneSplitSide };

/** Registration order is stable; callback reentry has a newer operation permission. */
export class WorkbenchPointerDropRegistry {
  private readonly targets = new Map<object, Target>();
  private preview: Lease | null = null;
  private operation: object = {};

  register(element: HTMLElement, controller: WorkbenchPointerDropTargetController): () => void {
    const key = {};
    this.targets.set(key, { element, controller });
    return () => {
      this.targets.delete(key);
      if (this.preview?.key === key) this.cancel();
    };
  }

  private resolve(payload: WorkbenchSessionDragPayload, x: number, y: number): Hit | null {
    for (const [key, target] of this.targets) {
      if (target.controller.canDrop && !target.controller.canDrop(payload)) continue;
      if (!this.targets.has(key)) continue;
      const side = resolveWorkbenchDropSide(target.element.getBoundingClientRect(), x, y);
      if (side && this.targets.has(key)) return { key, target, side };
    }
    return null;
  }

  private clear(): void {
    const previous = this.preview;
    // 撤销内部许可后才通知外部，unregister/cancel 重入不再递归清同一个 preview。
    this.preview = null;
    previous?.target.controller.onPreview(null);
  }

  update(payload: WorkbenchSessionDragPayload, x: number, y: number): boolean {
    const operation = {};
    this.operation = operation;
    const hit = this.resolve(payload, x, y);
    if (this.operation !== operation) return false;
    if (!hit) {
      this.clear();
      return false;
    }
    if (this.preview?.key !== hit.key) {
      this.clear();
      if (this.operation !== operation || !this.targets.has(hit.key)) return false;
      this.preview = hit;
    }
    hit.target.controller.onPreview(hit.side);
    return true;
  }

  finish(payload: WorkbenchSessionDragPayload, x: number, y: number): boolean {
    const operation = {};
    this.operation = operation;
    const hit = this.resolve(payload, x, y);
    if (this.operation !== operation) return false;
    this.clear();
    if (this.operation !== operation || !hit || !this.targets.has(hit.key)) return false;
    hit.target.controller.onDrop(hit.side, payload);
    return true;
  }

  cancel(): void {
    this.operation = {};
    this.clear();
  }
}
