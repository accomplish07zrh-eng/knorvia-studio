// SPDX-License-Identifier: Apache-2.0
// Source-exposed session/resource owner; source review and verification pending.
import type { DragCancelEvent, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { WorkbenchSessionDragPayload } from "@/v4/workbenchDragDrop.js";
import type { WorkbenchPointerPositionTracker } from "@/v4/workbenchPointerPositionTracker.js";
import {
  getGroupedTaskDragGroupId, getGroupedTaskDragTaskKey, getGroupedTaskViewSignature,
  projectGroupedDragOver, type GroupedTaskDragDirectionPosition,
} from "./groupedDragProjection.js";

type Presentation = { activeTaskKey: string | null; activeGroupId: string | null; width: number | null };
type SetUpdate = (current: Set<string>) => Set<string>;
export type GroupedDragPorts = {
  authoritative: () => KnorviaGroupedTaskView;
  collapsed: () => ReadonlySet<string>;
  setCollapsed: (update: SetUpdate) => void;
  payload: (taskKey: string) => WorkbenchSessionDragPayload | null;
  measure: (kind: "task" | "group", key: string) => number | null;
  animate: (view: KnorviaGroupedTaskView) => void;
  persist: (view: KnorviaGroupedTaskView, canPublish: () => boolean) => Promise<void>;
  failed: () => void;
  track: (document: Document, event: Event) => WorkbenchPointerPositionTracker | null;
  updateWorkbench: (payload: WorkbenchSessionDragPayload, x: number, y: number) => unknown;
  finishWorkbench: (payload: WorkbenchSessionDragPayload, x: number, y: number) => boolean;
  cancelWorkbench: () => void;
};

const empty = (): Presentation => ({ activeTaskKey: null, activeGroupId: null, width: null });

/** Temporary drag snapshots belong here; accepted order and persistent preferences stay outside. */
export class GroupedDragSessionOwner {
  private presentation = empty();
  private listeners = new Set<() => void>();
  private scope: object | null = null;
  private gesture: object = {};
  private origin: KnorviaGroupedTaskView | null = null;
  private preview: KnorviaGroupedTaskView | null = null;
  private collapsedSnapshot: { ids: Set<string>; restore: GroupedDragPorts["setCollapsed"] } | null = null;
  private direction: GroupedTaskDragDirectionPosition = "after";
  private deltaY = 0;
  private lastOver: DragOverEvent | null = null;
  private payload: WorkbenchSessionDragPayload | null = null;
  private pointer: WorkbenchPointerPositionTracker | null = null;

  constructor(private readonly ports: () => GroupedDragPorts) {}

  read = (): Presentation => this.presentation;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(presentation: Presentation): void {
    this.presentation = presentation;
    for (const listener of this.listeners) listener();
  }

  activate(): () => void {
    const scope = {};
    this.scope = scope;
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.gesture = {};
      this.clean(() => this.restoreCollapsed(), () => this.reset());
    };
  }

  pointerDown = (document: Document, event: Event): void => {
    if (!this.scope) return;
    const previous = this.pointer;
    this.pointer = null;
    previous?.dispose();
    this.pointer = this.ports().track(document, event);
  };

  start = (event: DragStartEvent): void => {
    if (!this.scope) return;
    this.gesture = {};
    try {
      if (this.origin) this.clean(() => this.restoreCollapsed(), () => this.reset(true));
      this.direction = "after";
      this.deltaY = 0;
      this.lastOver = null;
      const group = getGroupedTaskDragGroupId(event.active.data.current);
      const task = getGroupedTaskDragTaskKey(event.active.data.current);
      if (!group && !task) return;
      const ports = this.ports();
      this.origin = ports.authoritative();
      this.preview = this.origin;
      if (group) {
        this.collapsedSnapshot = { ids: new Set(ports.collapsed()), restore: ports.setCollapsed };
        const width = ports.measure("group", group);
        ports.setCollapsed((current) => current.has(group) ? current : new Set([...current, group]));
        this.publish({ activeTaskKey: null, activeGroupId: group, width: width ?? this.presentation.width });
      } else if (task) {
        this.payload = ports.payload(task);
        const width = ports.measure("task", task);
        this.publish({ activeTaskKey: task, activeGroupId: null, width: width ?? this.presentation.width });
      }
    } catch (error) {
      // 测量/外部回调失败仍抛原错，但不能留下 pointer 和临时 collapsed 偏好。
      try { this.clean(() => this.restoreCollapsed(), () => this.reset()); } catch { /* first failure wins */ }
      throw error;
    }
  };

  private previewOver(event: DragOverEvent): void {
    if (!this.scope || !event.over) return;
    const current = this.preview ?? this.ports().authoritative();
    const next = projectGroupedDragOver(current, event.active.data.current, event.over.data.current, this.direction);
    if (next === current || getGroupedTaskViewSignature(next) === getGroupedTaskViewSignature(current)) return;
    this.preview = next;
    this.ports().animate(next);
  }

  over = (event: DragOverEvent): void => {
    if (!this.scope) return;
    this.lastOver = event.over ? event : null;
    this.previewOver(event);
  };

  move = (event: DragMoveEvent): void => {
    if (!this.scope) return;
    const position = this.pointer?.getPosition();
    if (this.payload && position) this.ports().updateWorkbench(this.payload, position.x, position.y);
    const previous = this.direction;
    if (event.delta.y > this.deltaY) this.direction = "after";
    else if (event.delta.y < this.deltaY) this.direction = "before";
    this.deltaY = event.delta.y;
    if (previous !== this.direction && this.lastOver) this.previewOver(this.lastOver);
  };

  cancel = (event?: DragCancelEvent): void => {
    if (!this.scope) return;
    const group = getGroupedTaskDragGroupId(event?.active.data.current) ?? this.presentation.activeGroupId;
    this.clean(() => {
      if (group) this.restoreCollapsed();
      else if (this.origin) this.ports().animate(this.origin);
    }, () => this.reset());
  };

  end = (event: DragEndEvent): void => {
    const scope = this.scope;
    if (!scope) return;
    const gesture = this.gesture;
    const group = getGroupedTaskDragGroupId(event.active.data.current) ?? this.presentation.activeGroupId;
    const origin = this.origin, next = this.preview ?? this.ports().authoritative();
    const ports = this.ports();
    let acceptedByWorkbench = false;
    this.clean(() => {
      if (group) this.restoreCollapsed();
      else {
        const position = this.pointer?.getPosition();
        if (origin && this.payload && position) acceptedByWorkbench = ports.finishWorkbench(this.payload, position.x, position.y);
      }
    }, () => this.reset());
    if (!origin) return;
    if (acceptedByWorkbench || getGroupedTaskViewSignature(next) === getGroupedTaskViewSignature(origin)) {
      ports.animate(origin);
      return;
    }
    const canPublish = () => this.scope === scope && this.gesture === gesture;
    ports.animate(next);
    void this.save(next, origin, ports, canPublish, scope);
  };

  private async save(next: KnorviaGroupedTaskView, origin: KnorviaGroupedTaskView, ports: GroupedDragPorts, canPublish: () => boolean, scope: object): Promise<void> {
    try {
      await ports.persist(next, canPublish);
    } catch {
      if (canPublish()) this.ports().animate(origin);
      if (this.scope === scope) this.ports().failed();
    }
  }

  private restoreCollapsed(): void {
    const snapshot = this.collapsedSnapshot;
    this.collapsedSnapshot = null;
    if (snapshot) snapshot.restore(() => new Set(snapshot.ids));
  }

  private reset(preservePointer = false): void {
    const pointer = preservePointer ? null : this.pointer;
    if (!preservePointer) this.pointer = null;
    this.origin = null;
    this.preview = null;
    this.lastOver = null;
    this.direction = "after";
    this.deltaY = 0;
    this.payload = null;
    this.clean(() => this.ports().cancelWorkbench(), () => pointer?.dispose(), () => this.publish(empty()));
  }

  private clean(...operations: Array<() => void>): void {
    let failed = false, failure: unknown;
    for (const operation of operations) {
      try { operation(); } catch (error) { if (!failed) failure = error; failed = true; }
    }
    if (failed) throw failure;
  }
}
