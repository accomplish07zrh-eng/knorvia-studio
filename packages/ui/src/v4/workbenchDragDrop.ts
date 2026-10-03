import type { PaneSplitSide } from "@/v4/paneLayoutTree.js";

export const WORKBENCH_SESSION_DRAG_MIME = "application/x-knorvia-session";
export interface WorkbenchSessionDragPayload {
  readonly kind: "knorvia/session";
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly remoteSessionId?: string;
  readonly sessionId: string;
}
interface DataTransferLike {
  readonly types?: Iterable<string> | ArrayLike<string>;
  getData(type: string): string;
}
interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
const pointerDrag: { current: WorkbenchSessionDragPayload | null } = { current: null };

export function serializeWorkbenchSessionDragPayload(payload: WorkbenchSessionDragPayload): string {
  return JSON.stringify(payload);
}
export function setActiveWorkbenchSessionDragPayload(payload: WorkbenchSessionDragPayload): void {
  pointerDrag.current = payload;
}
export function clearActiveWorkbenchSessionDragPayload(): void {
  pointerDrag.current = null;
}

function decodedPayload(value: unknown): WorkbenchSessionDragPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const required: ReadonlyArray<readonly [string, (item: unknown) => boolean]> = [
    ["kind", (item) => item === "knorvia/session"],
    ["workspacePath", (item) => typeof item === "string"],
    ["sessionId", (item) => typeof item === "string"],
  ];
  for (const [field, accepts] of required) if (!accepts(record[field])) return null;
  const payload: WorkbenchSessionDragPayload = {
    kind: "knorvia/session",
    workspacePath: record.workspacePath as string,
    workspaceIdentity:
      typeof record.workspaceIdentity === "string" ? record.workspaceIdentity : undefined,
    remoteSessionId:
      typeof record.remoteSessionId === "string" ? record.remoteSessionId : undefined,
    sessionId: record.sessionId as string,
  };
  return payload;
}
export function parseWorkbenchSessionDragPayload(
  transfer: DataTransferLike,
): WorkbenchSessionDragPayload | null {
  const offered = Array.from(transfer.types ?? []);
  if (!offered.some((type) => type === WORKBENCH_SESSION_DRAG_MIME)) return null;
  try {
    const encoded = transfer.getData(WORKBENCH_SESSION_DRAG_MIME);
    return encoded ? decodedPayload(JSON.parse(encoded)) : pointerDrag.current;
  } catch {
    return null;
  }
}

export function resolveWorkbenchDropSide(
  rect: RectLike,
  clientX: number,
  clientY: number,
): PaneSplitSide | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const horizontal = (clientX - rect.left) / rect.width;
  const vertical = (clientY - rect.top) / rect.height;
  if (horizontal < 0 || horizontal > 1 || vertical < 0 || vertical > 1) return null;
  const x: readonly [PaneSplitSide, number] =
    horizontal > 0.5 ? ["right", 1 - horizontal] : ["left", horizontal];
  const y: readonly [PaneSplitSide, number] =
    vertical > 0.5 ? ["down", 1 - vertical] : ["up", vertical];
  // 严格小于才换轴，保持水平先于垂直的 tie 规则；NaN 不额外归一化。
  const nearest = y[1] < x[1] ? y : x;
  return nearest[1] <= 0.32 ? nearest[0] : null;
}
