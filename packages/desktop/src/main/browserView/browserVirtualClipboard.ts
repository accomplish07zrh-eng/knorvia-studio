import { randomUUID } from "node:crypto";

import type { ControlledView } from "./browserCommandTypes.js";
import {
  IAB_INPUT_TARGET_TOKEN_PROPERTY,
  VIRTUAL_PASTE_PAGE_FUNCTION,
} from "./browserVirtualClipboardPageScript.js";

export { IAB_INPUT_TARGET_TOKEN_PROPERTY } from "./browserVirtualClipboardPageScript.js";

type InputTarget = { contextId?: number; sessionId?: string };
type PasteOptions = {
  includeRichText?: boolean;
  initialTarget?: InputTarget;
  inputTargetToken?: string;
  replaceInputValue?: boolean;
};
type EvaluationResponse = {
  exceptionDetails?: {
    exception?: { description?: string; value?: unknown };
    text?: string;
  };
  result?: { objectId?: string; value?: unknown };
};
type ResolvedTarget = { target: InputTarget; ownedSessionIds: string[] };

function evaluationParams(
  target: InputTarget,
  expression: () => string,
  returnByValue: boolean,
  awaitPromise = false,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (target.contextId != null) params.contextId = target.contextId;
  params.expression = expression();
  if (awaitPromise) params.awaitPromise = true;
  params.returnByValue = returnByValue;
  return params;
}

async function sendToTarget(
  view: ControlledView,
  target: InputTarget,
  method: string,
  params: unknown,
): Promise<unknown> {
  return view.cdp.send(method, params, target.sessionId);
}

function evaluationError(response: EvaluationResponse): string | undefined {
  const details = response.exceptionDetails;
  if (!details) return undefined;
  return (
    details.exception?.description ??
    (details.exception?.value == null ? undefined : String(details.exception.value)) ??
    details.text ??
    "Browser Use virtual clipboard evaluation failed"
  );
}

function focusedFrameExpression(): string {
  return `(() => {
    const deepest = (root) => {
      const active = root.activeElement;
      if (active == null) return null;
      const activeWindow = active.ownerDocument.defaultView ?? window;
      if (active instanceof activeWindow.HTMLElement && active.shadowRoot != null) {
        return deepest(active.shadowRoot);
      }
      if (active instanceof activeWindow.HTMLIFrameElement || active instanceof activeWindow.HTMLFrameElement) {
        try {
          const frameDocument = active.contentDocument ?? active.contentWindow?.document ?? null;
          if (frameDocument != null) return deepest(frameDocument);
        } catch {}
        return active;
      }
      return null;
    };
    return deepest(document);
  })()`;
}

async function detachOwnedSessions(view: ControlledView, sessionIds: string[]): Promise<void> {
  await Promise.allSettled(
    sessionIds.map((sessionId) => view.cdp.send("Target.detachFromTarget", { sessionId })),
  );
}

async function attachToFrame(view: ControlledView, frameId: string): Promise<string | undefined> {
  const response = (await view.cdp
    .send("Target.attachToTarget", {
      flatten: true,
      targetId: frameId,
    })
    .catch(() => undefined)) as { sessionId?: string } | undefined;
  return response?.sessionId || undefined;
}

async function enableAttachedSession(view: ControlledView, sessionId: string): Promise<void> {
  const target = { sessionId };
  await Promise.all([
    sendToTarget(view, target, "Page.enable", undefined),
    sendToTarget(view, target, "Runtime.enable", undefined),
    sendToTarget(view, target, "DOM.enable", undefined),
  ]);
}

async function waitForFrameSession(
  view: ControlledView,
  frameId: string,
): Promise<string | undefined> {
  const deadline = Date.now() + 1000;
  for (;;) {
    const response = (await view.cdp.send("Target.getTargets").catch(() => undefined)) as
      | { targetInfos?: Array<{ targetId?: string; type?: string }> }
      | undefined;
    if (
      response?.targetInfos?.some(
        (target) => target.targetId === frameId && target.type === "iframe",
      )
    ) {
      const sessionId = await attachToFrame(view, frameId);
      if (sessionId) return sessionId;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(25, remaining)));
  }
}

async function resolveFocusedInputTarget(
  view: ControlledView,
  initialTarget: InputTarget = {},
): Promise<ResolvedTarget> {
  let target = initialTarget;
  const ownedSessionIds: string[] = [];
  const visited = new Set<string>();
  try {
    for (;;) {
      const key = `${target.sessionId ?? "root"}:${target.contextId ?? "default"}`;
      if (visited.has(key)) throw new Error("Browser Use encountered a focused frame cycle");
      visited.add(key);

      const response = (await sendToTarget(
        view,
        target,
        "Runtime.evaluate",
        evaluationParams(target, focusedFrameExpression, false),
      )) as EvaluationResponse;
      if (evaluationError(response))
        throw new Error("Browser Use could not inspect the focused frame");
      const objectId = response.result?.objectId;
      if (!objectId) return { target, ownedSessionIds };

      let frameId: string | undefined;
      try {
        const description = (await sendToTarget(view, target, "DOM.describeNode", {
          objectId,
        })) as { node?: { frameId?: string } };
        frameId = description.node?.frameId;
      } finally {
        await sendToTarget(view, target, "Runtime.releaseObject", { objectId }).catch(
          () => undefined,
        );
      }
      if (!frameId) return { target, ownedSessionIds };

      let sessionId = await attachToFrame(view, frameId);
      if (sessionId) {
        ownedSessionIds.push(sessionId);
        target = { sessionId };
        await enableAttachedSession(view, sessionId);
        continue;
      }

      const isolatedWorld = (await sendToTarget(view, target, "Page.createIsolatedWorld", {
        frameId,
        grantUniveralAccess: false,
        worldName: "browser-use-virtual-clipboard",
      }).catch(() => undefined)) as { executionContextId?: number } | undefined;
      if (isolatedWorld?.executionContextId) {
        target = { ...target, contextId: isolatedWorld.executionContextId };
        continue;
      }

      sessionId = await waitForFrameSession(view, frameId);
      if (!sessionId)
        throw new Error("Browser Use could not resolve an input target for frame " + frameId);
      ownedSessionIds.push(sessionId);
      target = { sessionId };
      await enableAttachedSession(view, sessionId);
    }
  } catch (error) {
    await detachOwnedSessions(view, ownedSessionIds);
    throw error;
  }
}

export function createInputTargetToken(): string {
  return randomUUID();
}

export async function assertFocusedInputTarget(
  view: ControlledView,
  target: InputTarget,
  inputTargetToken: string,
): Promise<void> {
  const expression = () => `(() => {
    const deepest = (root) => {
      const active = root.activeElement;
      if (active == null) return null;
      const activeWindow = active.ownerDocument.defaultView ?? window;
      if (active instanceof activeWindow.HTMLElement && active.shadowRoot != null) {
        return deepest(active.shadowRoot) ?? active;
      }
      return active;
    };
    return deepest(document)?.[${JSON.stringify(IAB_INPUT_TARGET_TOKEN_PROPERTY)}] === ${JSON.stringify(inputTargetToken)};
  })()`;
  const response = (await sendToTarget(
    view,
    target,
    "Runtime.evaluate",
    evaluationParams(target, expression, true),
  )) as EvaluationResponse;
  const error = evaluationError(response);
  if (error) throw new Error("Browser Use could not verify the focused input target: " + error);
  if (response.result?.value !== true) {
    throw new Error("Active element is no longer the expected input target");
  }
}

function shouldIncludeRichText(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.host !== "docs.google.com") return true;
    return parsed.pathname.split("/").filter(Boolean)[0] !== "spreadsheets";
  } catch {
    return true;
  }
}

function htmlForText(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/\r\n/gu, "<br>")
    .replace(/[\r\n\u2028\u2029]/gu, "<br>");
}

export async function pasteTextIntoFocusedTarget(
  view: ControlledView,
  text: string,
  options: PasteOptions = {},
): Promise<void> {
  const { target, ownedSessionIds } = await resolveFocusedInputTarget(view, options.initialTarget);
  try {
    const includeRichText =
      options.includeRichText ?? shouldIncludeRichText(view.webContents.getURL());
    const entries = [{ mime_type: "text/plain", text }];
    if (includeRichText) entries.push({ mime_type: "text/html", text: htmlForText(text) });
    const args = {
      clipboardItems: [{ entries, presentation_style: "unspecified" }],
      ...(options.inputTargetToken == null ? {} : { inputTargetToken: options.inputTargetToken }),
      replaceInputValue: options.replaceInputValue === true,
      richTextFallback: includeRichText,
    };

    const expression = () => `(async () => {
      try {
        const pageFunction = (${VIRTUAL_PASTE_PAGE_FUNCTION});
        const data = await pageFunction(${JSON.stringify(args)});
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })()`;
    const response = (await sendToTarget(
      view,
      target,
      "Runtime.evaluate",
      evaluationParams(target, expression, true, true),
    )) as EvaluationResponse;
    const prefix = "Browser Use encountered an error interacting with this webpage's clipboard: ";
    const error = evaluationError(response);
    if (error) throw new Error(prefix + error);
    const value = response.result?.value;
    if (!value || typeof value !== "object" || !("ok" in value)) {
      throw new Error(prefix + "type returned an invalid result");
    }
    if (value.ok !== true) {
      const message =
        "error" in value && typeof value.error === "string" ? value.error : "type failed";
      throw new Error(prefix + message);
    }
  } finally {
    await detachOwnedSessions(view, ownedSessionIds);
  }
}
