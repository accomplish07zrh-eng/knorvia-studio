import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { TID_V4_SPLIT_DIVIDER } from "@knorvia/shared";
import { cn } from "@/components/lib/utils.js";
import { clampSplitRatio, type SplitDirection } from "@/v4/paneLayoutTree.js";
import { SPLIT_VAR_PREFIX } from "@/v4/workbenchLayout.js";

interface WorkbenchSplitDividerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  splitId: string;
  direction: SplitDirection;
  ratio: number;
  regionFraction: number;
  style: CSSProperties;
  onCommitRatio: (splitId: string, ratio: number) => void;
}
type Inputs = Omit<WorkbenchSplitDividerProps, "style">;
type Pointer = ReactPointerEvent<HTMLDivElement>;
type Frame = { id?: number };
type Drag = {
  pointerId: number;
  inputs: Inputs;
  container: HTMLDivElement;
  regionPx: number;
  startClient: number;
  startRatio: number;
  latestClient: number;
  ready: boolean;
  frame: Frame | null;
};
function sameTarget(
  left: Inputs,
  right: Pick<Inputs, "containerRef" | "splitId" | "direction">,
): boolean {
  return (
    left.containerRef === right.containerRef &&
    left.splitId === right.splitId &&
    left.direction === right.direction
  );
}
function dragRatio(drag: Drag): number {
  return drag.regionPx <= 0
    ? drag.startRatio
    : clampSplitRatio(drag.startRatio + (drag.latestClient - drag.startClient) / drag.regionPx);
}

class SplitDividerGesture {
  private active: Drag | null = null;
  private operation = 0;
  constructor(
    private read: () => Inputs,
    private present: (dragging: boolean) => void,
  ) {}
  get dragging(): boolean {
    return this.active !== null;
  }
  private matches(drag: Drag): boolean {
    return (
      sameTarget(drag.inputs, this.read()) && drag.inputs.containerRef.current === drag.container
    );
  }
  private cancelFrame(drag: Drag): void {
    const frame = drag.frame;
    if (frame?.id !== undefined) cancelAnimationFrame(frame.id);
    if (drag.frame === frame) drag.frame = null;
  }
  cancel(target?: Pick<Inputs, "containerRef" | "splitId" | "direction">): void {
    if (this.active && target && !sameTarget(this.active.inputs, target)) return;
    this.operation += 1;
    const old = this.active;
    this.active = null;
    if (old) this.cancelFrame(old);
  }
  start(event: Pointer): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const inputs = this.read();
    const container = inputs.containerRef.current;
    if (!container) return;
    const admission = this.operation + 1;
    this.cancel();
    if (admission !== this.operation) return;
    const drag: Drag = {
      pointerId: event.pointerId,
      inputs,
      container,
      regionPx: 0,
      startClient: 0,
      startRatio: inputs.ratio,
      latestClient: 0,
      ready: false,
      frame: null,
    };
    this.active = drag;
    event.preventDefault();
    if (this.active !== drag || !this.matches(drag)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 保留合成 PointerEvent 无 active pointer 时的可失败 capture。 */
    }
    if (this.active !== drag || !this.matches(drag)) return;
    const rect = container.getBoundingClientRect();
    if (this.active !== drag || !this.matches(drag)) return;
    const row = inputs.direction === "row";
    const client = row ? event.clientX : event.clientY;
    drag.regionPx = (row ? rect.width : rect.height) * inputs.regionFraction;
    drag.startClient = client;
    drag.latestClient = client;
    drag.ready = true;
    this.present(true);
  }
  private current(event: Pointer): Drag | null {
    const drag = this.active;
    if (!drag || !drag.ready || drag.pointerId !== event.pointerId) return null;
    if (!this.matches(drag)) {
      this.cancel();
      this.present(this.dragging);
      return null;
    }
    return drag;
  }
  move(event: Pointer): void {
    const drag = this.current(event);
    if (!drag) return;
    drag.latestClient = drag.inputs.direction === "row" ? event.clientX : event.clientY;
    if (drag.frame) return;
    const frame: Frame = {};
    drag.frame = frame;
    try {
      const id = requestAnimationFrame(() => {
        if (this.active !== drag || drag.frame !== frame) return;
        drag.frame = null;
        if (!this.matches(drag)) {
          this.cancel(drag.inputs);
          this.present(this.dragging);
          return;
        }
        drag.container.style.setProperty(
          `${SPLIT_VAR_PREFIX}${drag.inputs.splitId}`,
          String(dragRatio(drag)),
        );
      });
      // frame 在申请前准入；同步 port 重入或 inline frame 不留下可覆写新 gesture 的旧 handle。
      if (this.active === drag && drag.frame === frame) frame.id = id;
      else cancelAnimationFrame(id);
    } catch (error) {
      if (drag.frame === frame) drag.frame = null;
      throw error;
    }
  }
  finish(event: Pointer): void {
    const drag = this.current(event);
    if (!drag) return;
    const inputs = this.read();
    this.cancelFrame(drag);
    if (this.active !== drag || !this.matches(drag)) return;
    drag.latestClient = drag.inputs.direction === "row" ? event.clientX : event.clientY;
    const ratio = dragRatio(drag);
    drag.container.style.setProperty(`${SPLIT_VAR_PREFIX}${drag.inputs.splitId}`, String(ratio));
    if (this.active !== drag || !this.matches(drag)) return;
    this.active = null;
    const completion = ++this.operation;
    this.present(false);
    // up/cancel 仍提交；外部 callback 前已释放旧票据，同步新 gesture 不被旧 end 清掉。
    if (completion === this.operation && sameTarget(inputs, this.read()))
      inputs.onCommitRatio(inputs.splitId, ratio);
  }
}

export const WorkbenchSplitDivider = memo(function WorkbenchSplitDivider({
  containerRef,
  splitId,
  direction,
  ratio,
  regionFraction,
  style,
  onCommitRatio,
}: WorkbenchSplitDividerProps) {
  const [dragging, setDragging] = useState(false);
  const inputs = useRef<Inputs>({
    containerRef,
    splitId,
    direction,
    ratio,
    regionFraction,
    onCommitRatio,
  });
  inputs.current = { containerRef, splitId, direction, ratio, regionFraction, onCommitRatio };
  const gestureRef = useRef<SplitDividerGesture | null>(null);
  if (gestureRef.current === null)
    gestureRef.current = new SplitDividerGesture(() => inputs.current, setDragging);
  const gesture = gestureRef.current;
  const isRow = direction === "row";
  const handlePointerDown = useCallback((event: Pointer) => gesture.start(event), [gesture]);
  const handlePointerMove = useCallback((event: Pointer) => gesture.move(event), [gesture]);
  const endDrag = useCallback((event: Pointer) => gesture.finish(event), [gesture]);
  useEffect(() => {
    setDragging(gesture.dragging);
    return () => gesture.cancel({ containerRef, splitId, direction });
  }, [containerRef, direction, gesture, splitId]);

  return (
    <div
      data-testid={TID_V4_SPLIT_DIVIDER}
      data-split-id={splitId}
      role="separator"
      aria-orientation={isRow ? "vertical" : "horizontal"}
      data-dragging={dragging ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={style}
      className={cn(
        "group absolute z-10 touch-none select-none",
        isRow ? "cursor-col-resize" : "cursor-row-resize",
      )}
    >
      <div
        className={cn(
          "pointer-events-none transition-colors",
          isRow ? "mx-auto h-full w-px" : "my-auto h-px w-full",
          dragging
            ? "bg-[var(--color-brand)]"
            : "bg-[var(--color-border)] group-hover:bg-[var(--color-brand)]",
        )}
      />
    </div>
  );
});
