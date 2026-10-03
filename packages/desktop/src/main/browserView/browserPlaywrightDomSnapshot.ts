import type { ControlledView } from "./browserCommandTypes.js";
import { getPlaywrightInjectedScriptSource } from "./playwrightInjectedScriptSource.js";

type Target = {
  frameId: string;
  contextId: number;
  sessionId?: string;
};

type Snapshot = {
  full: string;
  iframeDepths: Record<string, number>;
  iframeRefs: string[];
};

type State = {
  view: ControlledView;
  signal?: AbortSignal;
  worlds: Map<string, Target>;
  ownedSessions: Set<string>;
};

const WORLD_NAME = "knorvia-playwright-dom-snapshot";

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Browser DOM snapshot aborted", "AbortError");
  }
}

function send(
  state: State,
  method: string,
  params?: unknown,
  sessionId?: string,
): Promise<unknown> {
  checkAbort(state.signal);
  return state.view.cdp.send(method, params, sessionId);
}

function remaining(deadline: number): number {
  return Math.max(1, Math.min(500, deadline - Date.now()));
}

function keyOf(frameId: string, sessionId?: string): string {
  return (sessionId ?? "root") + ":" + frameId;
}

async function evaluate(
  state: State,
  target: Target,
  expression: string,
  returnByValue: boolean,
  timeout: number,
): Promise<Record<string, unknown>> {
  const response = (await send(
    state,
    "Runtime.evaluate",
    {
      awaitPromise: true,
      contextId: target.contextId,
      expression,
      returnByValue,
      timeout,
    },
    target.sessionId,
  )) as {
    exceptionDetails?: {
      exception?: { description?: string | null; value?: unknown };
      text?: string;
    };
    result?: Record<string, unknown>;
  };
  if (response.exceptionDetails) {
    const exception = response.exceptionDetails.exception;
    const message =
      exception?.description ??
      (exception?.value != null ? String(exception.value) : undefined) ??
      response.exceptionDetails.text ??
      "Playwright DOM snapshot evaluation failed";
    if (message) throw new Error(message);
  }
  return response.result ?? {};
}

async function getWorld(
  state: State,
  frameId: string,
  sessionId: string | undefined,
  timeout: number,
): Promise<Target> {
  const key = keyOf(frameId, sessionId);
  const existing = state.worlds.get(key);
  if (existing) return existing;

  const created = (await send(
    state,
    "Page.createIsolatedWorld",
    {
      frameId,
      worldName: WORLD_NAME,
      grantUniveralAccess: false,
    },
    sessionId,
  )) as { executionContextId?: number };
  const contextId = created.executionContextId;
  if (!contextId) {
    throw new Error("Unable to create Playwright isolated world for frame " + frameId);
  }
  const target: Target =
    sessionId === undefined ? { frameId, contextId } : { frameId, contextId, sessionId };

  const checked = await evaluate(
    state,
    target,
    "Boolean(globalThis.__knorviaPlaywrightInjected)",
    true,
    timeout,
  );
  if (checked.value !== true) {
    const source = getPlaywrightInjectedScriptSource();
    const expression =
      "(function(){const module={};\n" +
      source +
      "\nglobalThis.__knorviaPlaywrightInjected=new (module.exports.InjectedScript())" +
      "(globalThis,{browserName:'chromium',customEngines:[],isUnderTest:false," +
      "sdkLanguage:'javascript',stableRafCount:1,testIdAttributeName:'data-testid'});" +
      "return true;})()";
    const installed = await evaluate(state, target, expression, true, timeout);
    if (installed.value !== true) {
      throw new Error("Unable to initialize Playwright injected runtime");
    }
  }
  state.worlds.set(key, target);
  return target;
}

const SNAPSHOT_EXPRESSION =
  "(function(){" +
  "const root=document.body||document.documentElement;" +
  "if(!root)return {full:'',iframeDepths:{},iframeRefs:[]};" +
  "const injected=globalThis.__knorviaPlaywrightInjected;" +
  "const snapshot=injected.incrementalAriaSnapshot(root,{mode:'ai'});" +
  "return {...snapshot,iframeRefs:snapshot.iframeRefs.filter(function(ref){" +
  "if(!(ref in snapshot.iframeDepths))return false;" +
  "try{" +
  "const matches=injected.querySelectorAll(" +
  "injected.parseSelector('aria-ref='+ref),root);" +
  "const frame=matches[0];" +
  "return !!frame&&frame.getAttribute('aria-hidden')!=='true'&&" +
  "injected.elementState(frame,'visible').matches===true;" +
  "}catch{return false;}" +
  "})};" +
  "})()";

async function readSnapshot(state: State, target: Target, timeout: number): Promise<Snapshot> {
  const result = await evaluate(state, target, SNAPSHOT_EXPRESSION, true, timeout);
  const snapshot = result.value as Partial<Snapshot> | null | undefined;
  if (
    snapshot == null ||
    typeof snapshot.full !== "string" ||
    !Array.isArray(snapshot.iframeRefs) ||
    !snapshot.iframeDepths ||
    typeof snapshot.iframeDepths !== "object"
  ) {
    throw new Error("Playwright injected runtime returned an invalid DOM snapshot");
  }
  return snapshot as Snapshot;
}

async function frameForRef(
  state: State,
  parent: Target,
  ref: string,
  timeout: number,
): Promise<unknown> {
  let objectId: unknown;
  try {
    const expression =
      "(function(){const root=document.body||document.documentElement;" +
      "if(!root)return null;" +
      "const injected=globalThis.__knorviaPlaywrightInjected;" +
      "return injected.querySelectorAll(injected.parseSelector(" +
      JSON.stringify("aria-ref=" + ref) +
      "),root)[0]||null;})()";
    const result = await evaluate(state, parent, expression, false, timeout);
    if (result.subtype === "null" || !result.objectId) return undefined;
    objectId = result.objectId;
    const described = (await send(state, "DOM.describeNode", { objectId }, parent.sessionId)) as {
      node?: { frameId?: unknown };
    };
    return described.node?.frameId;
  } catch {
    return undefined;
  } finally {
    if (objectId) {
      try {
        await send(state, "Runtime.releaseObject", { objectId }, parent.sessionId);
      } catch {
        // The object may already be gone.
      }
    }
  }
}

async function childWorld(
  state: State,
  frameId: string,
  parentSessionId: string | undefined,
  timeout: number,
): Promise<Target | undefined> {
  try {
    return await getWorld(state, frameId, parentSessionId, timeout);
  } catch {
    // A cross-process frame needs a target session.
  }

  for (const sessionId of state.ownedSessions) {
    const existing = state.worlds.get(keyOf(frameId, sessionId));
    if (existing) return existing;
  }

  try {
    const attached = (await send(
      state,
      "Target.attachToTarget",
      { flatten: true, targetId: frameId },
      undefined,
    )) as { sessionId?: string };
    const sessionId = attached.sessionId;
    if (!sessionId) return undefined;
    state.ownedSessions.add(sessionId);
    await send(state, "Page.enable", undefined, sessionId);
    await send(state, "Runtime.enable", undefined, sessionId);
    await send(state, "DOM.enable", undefined, sessionId);
    return await getWorld(state, frameId, sessionId, timeout);
  } catch {
    return undefined;
  }
}

async function findChild(
  state: State,
  parent: Target,
  ref: string,
  deadline: number,
): Promise<Target | undefined> {
  if (Date.now() >= deadline) return undefined;
  const firstTimeout = remaining(deadline);
  let frameId = await frameForRef(state, parent, ref, firstTimeout);
  if (!frameId || Date.now() >= deadline) return undefined;

  let target = await childWorld(state, frameId as string, parent.sessionId, firstTimeout);
  if (!target && Date.now() < deadline) {
    try {
      await send(state, "Target.getTargets", undefined, parent.sessionId);
    } catch {
      // Refresh is an optional child probe.
    }
    frameId = await frameForRef(state, parent, ref, remaining(deadline));
    if (frameId) {
      target = await childWorld(state, frameId as string, parent.sessionId, remaining(deadline));
    }
  }
  return target;
}

function merge(full: string, expanded: Map<string, string>): string {
  if (expanded.size === 0) return full;
  return full
    .split("\n")
    .map((line) => {
      if (!line.trimStart().startsWith("- iframe")) return line;
      const ref = line.match(/\[ref=([^\]]+)\]/)?.[1];
      if (ref === undefined) return line;
      const child = expanded.get(ref);
      if (!child) return line;
      const spaces = line.match(/^ */)?.[0] ?? "";
      const lines = child
        .split("\n")
        .map((childLine) => spaces + "  " + childLine)
        .join("\n");
      return line + (line.endsWith(":") ? "" : ":") + "\n" + lines;
    })
    .join("\n");
}

async function expand(
  state: State,
  snapshot: Snapshot,
  parent: Target,
  deadline: number,
): Promise<string> {
  const refs = snapshot.iframeRefs.filter((ref) => ref in snapshot.iframeDepths);
  if (refs.length === 0 || Date.now() >= deadline) return snapshot.full;
  const entries = await Promise.all(
    refs.map(async (ref) => {
      if (Date.now() >= deadline) return [ref, ""] as const;
      const target = await findChild(state, parent, ref, deadline);
      if (!target || Date.now() >= deadline) return [ref, ""] as const;
      try {
        const child = await readSnapshot(state, target, remaining(deadline));
        const full = await expand(state, child, target, deadline);
        return [ref, full] as const;
      } catch {
        return [ref, ""] as const;
      }
    }),
  );
  return merge(snapshot.full, new Map(entries));
}

type Node = { text: string; children: Node[] };

function normalize(full: string): string {
  if (!full.startsWith("- ") && !full.includes("\n- ") && !full.includes("\n  - ")) return full;

  const root: Node = { text: "", children: [] };
  const stack: Array<{ indent: number; node: Node }> = [{ indent: -1, node: root }];
  for (const line of full.split("\n")) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const node: Node = {
      text: line.slice(indent).replace(/ \[(?:ref|cursor)=[^\]]+\]/g, ""),
      children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }

  const lines: string[] = [];
  function render(node: Node, depth: number): void {
    if (/^- img(?: \[[^\]]+\])*:?$/.test(node.text)) return;
    const anonymous = /^- (?:generic|listitem|group)(?: \[[^\]]+\])*:?$/.test(node.text);
    if (!anonymous) lines.push("  ".repeat(depth) + node.text);
    for (const child of node.children) {
      render(child, anonymous ? depth : depth + 1);
    }
  }
  for (const node of root.children) render(node, 0);
  return lines.join("\n");
}

export async function captureBrowserDomSnapshot(
  view: ControlledView,
  signal?: AbortSignal,
): Promise<string> {
  const state: State = {
    view,
    signal,
    worlds: new Map(),
    ownedSessions: new Set(),
  };
  await send(state, "Page.enable", undefined, undefined);
  await send(state, "Runtime.enable", undefined, undefined);
  await send(state, "DOM.enable", undefined, undefined);
  const tree = (await send(state, "Page.getFrameTree", undefined, undefined)) as {
    frameTree?: { frame?: { id?: string } };
  };
  const frameId = tree.frameTree?.frame?.id;
  if (!frameId) {
    throw new Error("Page.getFrameTree returned no main frame id");
  }

  try {
    const target = await getWorld(state, frameId, undefined, 3000);
    const snapshot = await readSnapshot(state, target, 3000);
    const full = await expand(state, snapshot, target, Date.now() + 1000);
    return normalize(full);
  } finally {
    const sessions = [...state.ownedSessions];
    await Promise.allSettled(
      sessions.map((sessionId) => view.cdp.send("Target.detachFromTarget", { sessionId })),
    );
    state.ownedSessions.clear();
  }
}
