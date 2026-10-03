import type { BrowserCommand, BrowserCommandResult } from "@knorvia/shared";
import type { ControlledView } from "./browserCommandTypes.js";
import { now, readState } from "./browserCommandState.js";
import {
  handleClick,
  handleType,
  handlePress,
  handleCuaKeypress,
  handleScroll,
  handleCuaScroll,
  handleDomCuaScroll,
  handleHover,
  handleSelect,
  handleCheck,
  handleDrag,
  handleCuaDrag,
  handleElementInfo,
} from "./browserCommandInteractionHandlers.js";
import {
  handleNavigate,
  handleGetState,
  handleScreenshot,
  handleSnapshot,
  handleEvaluate,
} from "./browserCommandPageHandlers.js";
import { handlePlaywrightAction } from "./browserPlaywrightExecutor.js";

export { isAllowedBrowserUrl } from "./browserCommandState.js";
export type {
  BrowserPoint,
  ControlledView,
  ControlledViewCdp,
  ControlledViewWebContents,
} from "./browserCommandTypes.js";

export async function executeBrowserCommandOnView(
  view: ControlledView,
  command: BrowserCommand,
  opts?: { navigateSettleMs?: number; signal?: AbortSignal },
): Promise<BrowserCommandResult> {
  const startedAt = now();
  const done = (partial: Omit<BrowserCommandResult, "elapsedMs">): BrowserCommandResult => ({
    ...partial,
    elapsedMs: now() - startedAt,
  });

  try {
    switch (command.method) {
      case "navigate":
        return await handleNavigate(view, command, done, opts);
      case "getState":
        return await handleGetState(view, done);
      case "screenshot":
        return await handleScreenshot(view, command, done);
      case "snapshot":
        return await handleSnapshot(view, command, done);
      case "evaluate":
        return await handleEvaluate(view, command, done);
      case "click":
        return await handleClick(view, command, done);
      case "type":
        return await handleType(view, command, done);
      case "press":
        return await handlePress(view, command, done);
      case "cuaKeypress":
        return await handleCuaKeypress(view, command, done);
      case "scroll":
        return await handleScroll(view, command, done);
      case "cuaScroll":
        return await handleCuaScroll(view, command, done);
      case "domCuaScroll":
        return await handleDomCuaScroll(view, command, done);
      case "hover":
        return await handleHover(view, command, done);
      case "select":
        return await handleSelect(view, command, done);
      case "check":
        return await handleCheck(view, command, done);
      case "drag":
        return await handleDrag(view, command, done);
      case "cuaDrag":
        return await handleCuaDrag(view, command, done);
      case "elementInfo":
        return await handleElementInfo(view, command, done);
      case "playwright":
        return await handlePlaywrightAction(view, command.action, done, opts?.signal);
      case "back":
        view.webContents.goBack();
        return done({ ok: true, state: readState(view.webContents) });
      case "forward":
        view.webContents.goForward();
        return done({ ok: true, state: readState(view.webContents) });
      case "reload":
        view.webContents.reload();
        return done({ ok: true, state: readState(view.webContents) });
      default:
        return done({
          ok: false,
          error: {
            code: "capability_unsupported",
            message: `command ${command.method} is not supported by executor (available: navigate/getState/back/forward/reload/screenshot/snapshot/click/type/press/scroll/hover/select/check/drag/elementInfo/evaluate)`,
          },
        });
    }
  } catch (error) {
    const cancelled =
      opts?.signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
    const timedOut =
      !cancelled &&
      error instanceof Error &&
      (error.name === "TimeoutError" || /\b(?:timed out|timeout exceeded)\b/iu.test(error.message));
    return done({
      ok: false,
      error: {
        code: cancelled ? "cancelled" : timedOut ? "timeout" : "execution_error",
        message: cancelled
          ? "Browser command cancelled"
          : error instanceof Error
            ? error.message
            : String(error),
      },
    });
  }
}
