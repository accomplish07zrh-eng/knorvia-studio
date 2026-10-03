import { browserSnapshotElementSchema } from "@knorvia/shared";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/shared";
import type { BrowserPoint, ControlledView } from "./browserCommandTypes.js";
import type { BrowserCommandDone } from "./browserCommandResult.js";
import { executionError, refNotFound } from "./browserCommandResult.js";
import { CHECK_SCRIPT, ELEMENT_AT_POINT_SCRIPT, SELECT_SCRIPT } from "./browserCommandScripts.js";
import { readState } from "./browserCommandState.js";
import {
  dispatchClickAt,
  dispatchDrag,
  dispatchDragPath,
  dispatchKey,
  dispatchKeyPress,
  dispatchScrollGesture,
  modifiersBitmask,
  resolveRefCenter,
} from "./browserCommandInput.js";
import { pasteTextIntoFocusedTarget } from "./browserVirtualClipboard.js";

type PointResolution =
  | { kind: "point"; point: BrowserPoint }
  | { kind: "error"; error: Omit<BrowserCommandResult, "elapsedMs"> };

async function resolvePointer(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "click" | "hover" }>,
  label: "click" | "hover",
): Promise<PointResolution> {
  if (command.ref) {
    const point = await resolveRefCenter(view, command.ref);
    if (!point) return { kind: "error", error: refNotFound(command.ref) };
    return { kind: "point", point };
  }
  if (typeof command.x !== "number" || typeof command.y !== "number") {
    return { kind: "error", error: executionError(`${label} requires ref or (x,y)`) };
  }
  return { kind: "point", point: { cx: command.x, cy: command.y } };
}

async function resolveDragEndpoint(
  view: ControlledView,
  ref: string | undefined,
  coordinates: { x: number; y: number } | undefined,
  missingMessage: string,
): Promise<PointResolution> {
  if (ref) {
    const point = await resolveRefCenter(view, ref);
    if (!point) return { kind: "error", error: refNotFound(ref) };
    return { kind: "point", point };
  }
  if (coordinates) {
    return { kind: "point", point: { cx: coordinates.x, cy: coordinates.y } };
  }
  return { kind: "error", error: executionError(missingMessage) };
}

export async function handleClick(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "click" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const resolution = await resolvePointer(view, command, "click");
  if (resolution.kind === "error") return done(resolution.error);
  await dispatchClickAt(
    view,
    resolution.point,
    command.button ?? "left",
    command.doubleClick === true,
    modifiersBitmask(command.modifiers),
  );
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleType(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "type" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  if (command.ref) {
    const point = await resolveRefCenter(view, command.ref);
    if (!point) return done(refNotFound(command.ref));
    await dispatchClickAt(view, point, "left", false);
  }
  await pasteTextIntoFocusedTarget(view, command.text);
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handlePress(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "press" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  if (command.ref) {
    const point = await resolveRefCenter(view, command.ref);
    if (!point) return done(refNotFound(command.ref));
    await dispatchClickAt(view, point, "left", false);
  }
  await dispatchKey(view, command.key, modifiersBitmask(command.modifiers));
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleCuaKeypress(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "cuaKeypress" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  await dispatchKeyPress(view, command.keys);
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleScroll(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "scroll" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  if (command.ref) {
    const point = await resolveRefCenter(view, command.ref);
    if (!point) return done(refNotFound(command.ref));
  } else {
    await view.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 0,
      y: 0,
      deltaX: command.x ?? 0,
      deltaY: command.y ?? 0,
    });
  }
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleCuaScroll(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "cuaScroll" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  await dispatchScrollGesture(
    view,
    { cx: command.x, cy: command.y },
    command.scrollX,
    command.scrollY,
    modifiersBitmask(command.modifiers),
  );
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleDomCuaScroll(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "domCuaScroll" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  let point: BrowserPoint;
  if (command.nodeId) {
    const resolved = await resolveRefCenter(view, command.nodeId);
    if (!resolved) return done(refNotFound(command.nodeId));
    point = resolved;
  } else {
    const metrics = await view.cdp.send("Page.getLayoutMetrics");
    const width = (
      metrics as {
        cssVisualViewport?: { clientWidth?: unknown; clientHeight?: unknown };
      }
    ).cssVisualViewport?.clientWidth;
    const height = (
      metrics as {
        cssVisualViewport?: { clientWidth?: unknown; clientHeight?: unknown };
      }
    ).cssVisualViewport?.clientHeight;
    if (typeof width !== "number" || typeof height !== "number") {
      return done(executionError("Page.getLayoutMetrics returned no cssVisualViewport"));
    }
    point = { cx: width / 2, cy: height / 2 };
  }
  await dispatchScrollGesture(view, point, command.scrollX, command.scrollY);
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleHover(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "hover" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const resolution = await resolvePointer(view, command, "hover");
  if (resolution.kind === "error") return done(resolution.error);
  const event: { type: "mouseMoved"; x: number; y: number; modifiers?: number } = {
    type: "mouseMoved",
    x: resolution.point.cx,
    y: resolution.point.cy,
  };
  if (modifiersBitmask(command.modifiers) > 0) {
    event.modifiers = modifiersBitmask(command.modifiers);
  }
  await view.cdp.send("Input.dispatchMouseEvent", event);
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleSelect(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "select" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const result = await view.webContents.executeJavaScript(
    SELECT_SCRIPT(command.ref, command.values),
  );
  if (!result || typeof result !== "object") {
    return done(executionError("select returned invalid result"));
  }
  const raw = result as { error?: unknown };
  if (raw.error === "ref_not_found") return done(refNotFound(command.ref));
  if (raw.error === "not_select") {
    return done(executionError(`element ${command.ref} is not a <select>`));
  }
  if (raw.error === "no_match") {
    return done(executionError(`no <option> matched values ${JSON.stringify(command.values)}`));
  }
  if (raw.error) return done(executionError(`select failed: ${raw.error}`));
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleCheck(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "check" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const result = await view.webContents.executeJavaScript(
    CHECK_SCRIPT(command.ref, command.checked ?? true),
  );
  if (!result || typeof result !== "object") {
    return done(executionError("check returned invalid result"));
  }
  const raw = result as { error?: unknown };
  if (raw.error === "ref_not_found") return done(refNotFound(command.ref));
  if (raw.error === "not_checkable") {
    return done(executionError(`element ${command.ref} is not a checkbox/radio`));
  }
  if (raw.error) return done(executionError(`check failed: ${raw.error}`));
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleDrag(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "drag" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const from = await resolveDragEndpoint(
    view,
    command.fromRef,
    command.from,
    "drag requires fromRef or from{x,y}",
  );
  if (from.kind === "error") return done(from.error);

  const to = await resolveDragEndpoint(
    view,
    command.toRef,
    command.to,
    "drag requires toRef or to{x,y}",
  );
  if (to.kind === "error") return done(to.error);

  await dispatchDrag(view, from.point, to.point, modifiersBitmask(command.modifiers));
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleCuaDrag(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "cuaDrag" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  await dispatchDragPath(view, command.path, modifiersBitmask(command.modifiers));
  return done({ ok: true, state: readState(view.webContents) });
}

export async function handleElementInfo(
  view: ControlledView,
  command: Extract<BrowserCommand, { method: "elementInfo" }>,
  done: BrowserCommandDone,
): Promise<BrowserCommandResult> {
  const result = await view.webContents.executeJavaScript(
    ELEMENT_AT_POINT_SCRIPT(command.x, command.y),
  );
  if (result === null || result === undefined) return done({ ok: true });
  const parsed = browserSnapshotElementSchema.safeParse(result);
  if (!parsed.success) {
    return done(
      executionError(
        `invalid element result shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    );
  }
  return done({ ok: true, element: parsed.data });
}
