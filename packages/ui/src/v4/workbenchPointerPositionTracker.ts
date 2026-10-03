// SPDX-License-Identifier: Apache-2.0
// Source-exposed pointer/resource candidate; source and runtime review pending.
interface WorkbenchPointerPosition {
  x: number;
  y: number;
}

interface WorkbenchPointerPositionTracker {
  dispose: () => void;
  getPosition: () => WorkbenchPointerPosition;
}

const observations = ["pointermove", "pointerup", "pointercancel"] as const;

/** One capture observer routes all events; its ledger owns every installed listener. */
class PointerCaptureLease implements WorkbenchPointerPositionTracker {
  private active = true;
  private listeners: Array<(typeof observations)[number]> = [];

  constructor(
    private readonly document: Document,
    private position: WorkbenchPointerPosition,
  ) {}

  getPosition = (): WorkbenchPointerPosition => this.position;

  private consume = (event: Event): void => {
    if (!this.active) return;
    if (event.type !== "pointercancel") {
      const pointer = event as PointerEvent;
      this.position = { x: pointer.clientX, y: pointer.clientY };
    }
    if (event.type !== "pointermove") this.dispose();
  };

  install(): void {
    try {
      for (const type of observations) {
        // 先登记：addEventListener 即使装入后抛错，仍有 owned 清理路径。
        this.listeners.push(type);
        this.document.addEventListener(type, this.consume, true);
      }
    } catch (error) {
      try {
        this.dispose();
      } catch {
        /* preserve the installation failure */
      }
      throw error;
    }
  }

  dispose = (): void => {
    if (!this.active) return;
    this.active = false;
    const listeners = this.listeners;
    this.listeners = [];
    let failed = false,
      failure: unknown;
    for (const type of listeners) {
      try {
        this.document.removeEventListener(type, this.consume, true);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  };
}

function createWorkbenchPointerPositionTracker(
  ownerDocument: Document,
  activatorEvent: Event,
): WorkbenchPointerPositionTracker | null {
  if (!("clientX" in activatorEvent) || !("clientY" in activatorEvent)) return null;
  const { clientX, clientY } = activatorEvent as Event & { clientX: unknown; clientY: unknown };
  // 保留原 number 契约（包含 NaN）；不把坐标准入改成新的数据格式约束。
  if (typeof clientX !== "number" || typeof clientY !== "number") return null;
  const lease = new PointerCaptureLease(ownerDocument, { x: clientX, y: clientY });
  lease.install();
  return lease;
}

export { createWorkbenchPointerPositionTracker, type WorkbenchPointerPositionTracker };
