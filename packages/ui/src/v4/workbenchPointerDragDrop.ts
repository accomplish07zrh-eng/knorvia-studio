// SPDX-License-Identifier: Apache-2.0
// Existing public pointer ports; implementation delegated to a contract candidate.
import type { WorkbenchSessionDragPayload } from "@/v4/workbenchDragDrop.js";
import {
  WorkbenchPointerDropRegistry,
  type WorkbenchPointerDropTargetController,
} from "./workbenchPointerDropRegistry.js";

const registry = new WorkbenchPointerDropRegistry();

export function registerWorkbenchPointerDropTarget(
  element: HTMLElement,
  controller: WorkbenchPointerDropTargetController,
): () => void {
  return registry.register(element, controller);
}

export function updateWorkbenchPointerDrag(
  payload: WorkbenchSessionDragPayload,
  clientX: number,
  clientY: number,
): boolean {
  return registry.update(payload, clientX, clientY);
}

export function finishWorkbenchPointerDrag(
  payload: WorkbenchSessionDragPayload,
  clientX: number,
  clientY: number,
): boolean {
  return registry.finish(payload, clientX, clientY);
}

export function cancelWorkbenchPointerDrag(): void {
  registry.cancel();
}
