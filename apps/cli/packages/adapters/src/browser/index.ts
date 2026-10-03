import { randomUUID } from "node:crypto";
import type { Browser } from "playwright-core";
import type {
  BrowserBackendDescriptor,
  BrowserCommand,
  BrowserCommandResult,
  BrowserControlExecuteInput,
  BrowserControlListInput,
  BrowserControlPort,
} from "@knorvia/contracts";
import { createManagedCdpDescriptor } from "./descriptor.js";
import {
  loadPlaywrightChromium,
  resolveInstalledBrowserExecutable,
  validateExplicitBrowserExecutable,
} from "./executable.js";
import type { BrowserExecutableResolutionOptions, PlaywrightChromiumModule } from "./executable.js";
import { abortError, classifyError, hasSideEffects, raceWithAbort } from "./request.js";
import { ManagedCdpSession } from "./session.js";
import { executeManagedPageCommand } from "./page-command.js";

export {
  resolveInstalledBrowserExecutable,
  validateExplicitBrowserExecutable,
} from "./executable.js";
export type { BrowserExecutableResolutionOptions, PlaywrightChromiumModule } from "./executable.js";
export { isAllowedManagedBrowserUrl } from "./page-command.js";

export interface ManagedCdpBrowserRuntimeOptions extends BrowserExecutableResolutionOptions {
  closeTimeoutMs?: number;
  loadPlaywright?: () => Promise<PlaywrightChromiumModule>;
}

export interface ManagedCdpBrowserRuntime {
  browserControlPort: BrowserControlPort;
  close(): Promise<void>;
}

type CommandReply = Omit<BrowserCommandResult, "elapsedMs">;
type RequestEntry = {
  sessionId: string;
  turnId: string | undefined;
  controller: AbortController;
};

const DEFAULT_CLOSE_TIMEOUT_MS = 1500;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const NO_FIRST_RUN_ARGUMENT = "--no-first-run";
const NO_DEFAULT_BROWSER_ARGUMENT = "--no-default-browser-check";
const CLOSED_MESSAGE = "Managed CDP browser runtime is closed";
const CONTEXT_UNAVAILABLE_MESSAGE =
  "Managed CDP browser context became unavailable during creation";
const LOAD_FAILURE_MESSAGE =
  "Managed headless Chromium is unavailable: failed to load the pinned Playwright runtime.";
const LAUNCH_FAILURE_MESSAGE =
  "Managed headless Chromium is unavailable: launch failed. Verify the browser executable and OS sandbox/runtime dependencies.";

export function createManagedCdpBrowserRuntime(
  options: ManagedCdpBrowserRuntimeOptions = {},
): ManagedCdpBrowserRuntime {
  const settings = { ...options };
  settings.executablePath = validateExplicitBrowserExecutable(
    options.executablePath,
    options.platform,
  );
  const load = settings.loadPlaywright ?? loadPlaywrightChromium;
  const browserId = `cdp:${randomUUID()}`;
  const closeLimit = Math.max(1, Math.trunc(settings.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS));
  let generation = 1;
  let disposed = false;
  let ownedBrowser: Browser | undefined;
  let launching: Promise<Browser> | undefined;
  const sessions = new Map<string, ManagedCdpSession>();
  const admissions = new Map<string, Promise<ManagedCdpSession>>();
  const closing = new Set<string>();
  const requests = new Map<string, RequestEntry>();

  function bounded(promise: Promise<unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (completed: boolean) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        resolve(completed);
      };
      timer = setTimeout(() => finish(false), closeLimit);
      promise.then(
        () => finish(true),
        () => finish(true),
      );
    });
  }

  async function closeInstance(browser: Browser): Promise<void> {
    if (browser.isConnected()) await bounded(browser.close());
  }

  async function closeOwnedBrowser(): Promise<void> {
    const browser = ownedBrowser;
    ownedBrowser = undefined;
    if (browser) await closeInstance(browser);
  }

  async function closeIfUnused(): Promise<void> {
    if (sessions.size === 0) await closeOwnedBrowser();
  }

  async function launchBrowser(): Promise<Browser> {
    let playwright: PlaywrightChromiumModule;
    try {
      playwright = await load();
    } catch (cause) {
      throw new Error(LOAD_FAILURE_MESSAGE, { cause });
    }
    const executablePath = resolveInstalledBrowserExecutable(playwright, settings);
    let browser: Browser;
    try {
      browser = await playwright.chromium.launch({
        executablePath,
        headless: true,
        args: [NO_FIRST_RUN_ARGUMENT, NO_DEFAULT_BROWSER_ARGUMENT],
      });
    } catch (cause) {
      throw new Error(LAUNCH_FAILURE_MESSAGE, { cause });
    }
    if (disposed) {
      await closeInstance(browser);
      throw new Error(CLOSED_MESSAGE);
    }
    browser.on("disconnected", () => {
      if (ownedBrowser !== browser) return;
      ownedBrowser = undefined;
      sessions.clear();
      generation += 1;
    });
    ownedBrowser = browser;
    return browser;
  }

  async function acquireBrowser(signal?: AbortSignal): Promise<Browser> {
    if (disposed) throw new Error(CLOSED_MESSAGE);
    if (signal?.aborted) throw abortError();
    if (ownedBrowser?.isConnected()) return ownedBrowser;
    if (!launching) {
      const attempt = launchBrowser();
      launching = attempt.finally(() => {
        launching = undefined;
      });
    }
    const acquired = await (signal ? raceWithAbort(launching, signal) : launching);
    if (signal?.aborted) {
      await closeInstance(acquired);
      throw abortError();
    }
    return acquired;
  }

  async function acquireSession(sessionId: string): Promise<ManagedCdpSession> {
    if (closing.has(sessionId)) throw new Error(`Browser session '${sessionId}' is closing`);
    const registered = sessions.get(sessionId);
    if (registered) return registered;
    const pending = admissions.get(sessionId);
    if (pending) return pending;
    // IIFE 创建期间尚无票据；首个 await 后才按已登记 Promise 身份清理，不增加结算轮次。
    let admission: Promise<ManagedCdpSession> | undefined;
    admission = (async () => {
      try {
        const creator = await acquireBrowser();
        const creatorGeneration = generation;
        const context = await creator.newContext({
          acceptDownloads: false,
          viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
        });
        if (
          disposed ||
          closing.has(sessionId) ||
          ownedBrowser !== creator ||
          generation !== creatorGeneration ||
          !creator.isConnected()
        ) {
          await bounded(context.close());
          throw new Error(CONTEXT_UNAVAILABLE_MESSAGE);
        }
        const session = new ManagedCdpSession(context);
        sessions.set(sessionId, session);
        return session;
      } finally {
        if (admissions.get(sessionId) === admission) admissions.delete(sessionId);
      }
    })();
    admissions.set(sessionId, admission);
    return admission;
  }

  async function dispatch(
    session: ManagedCdpSession,
    command: BrowserCommand,
  ): Promise<CommandReply> {
    switch (command.method) {
      case "list":
        return { ok: true, tabs: await session.listTabs() };
      case "newTab": {
        const created = await session.createTab();
        const tab = (await session.listTabs()).find((item) => item.tabId === created.id);
        return { ok: true, tab };
      }
      case "activateTab": {
        const activated = await session.activateTab(command.tabId);
        const tab = (await session.listTabs()).find((item) => item.tabId === activated.id);
        return { ok: true, tab };
      }
      case "close":
        await session.closeTab(command.tabId);
        return { ok: true };
      case "browserViewportSet":
        await session.setViewport(command.tabId, { width: command.width, height: command.height });
        return { ok: true };
      case "browserViewportReset":
        await session.setViewport(command.tabId, null);
        return { ok: true };
      case "getDialog": {
        const tab = await session.ensureTab(command.tabId);
        const dialog = session.dialogFor(tab.id);
        if (!dialog) return { ok: true, dialog: null };
        const type = dialog.type();
        if (
          type !== "alert" &&
          type !== "confirm" &&
          type !== "prompt" &&
          type !== "beforeunload"
        ) {
          return { ok: true, dialog: null };
        }
        return {
          ok: true,
          dialog: {
            type,
            message: dialog.message(),
            ...(dialog.defaultValue() ? { defaultPrompt: dialog.defaultValue() } : {}),
          },
        };
      }
      case "handleDialog": {
        const tab = await session.ensureTab(command.tabId);
        const dialog = session.dialogFor(tab.id);
        if (!dialog) throw new Error("No JavaScript dialog is pending for this tab");
        if (command.accept) await dialog.accept(command.promptText);
        else await dialog.dismiss();
        session.clearDialog(tab.id);
        return { ok: true };
      }
      case "nameSession":
        return { ok: true };
      case "listUserTabs":
        return { ok: true, userTabs: [] };
      case "browserVisibilityGet":
      case "browserVisibilitySet":
      case "capabilities":
      case "claimTab":
      case "finalize":
      case "finalizeTabs":
      case "markDeliverable":
      case "markHandoff":
      case "turnEnded":
      case "closeSession":
      case "cancelRequest":
        return {
          ok: false,
          error: {
            code: "capability_unsupported",
            message: `Browser command '${command.method}' is unavailable in managed headless CDP`,
          },
        };
      default: {
        const tab = await session.ensureTab("tabId" in command ? command.tabId : undefined);
        return executeManagedPageCommand(tab.page, command);
      }
    }
  }

  async function enrich(
    session: ManagedCdpSession,
    command: BrowserCommand,
    reply: CommandReply,
    started: number,
  ): Promise<BrowserCommandResult> {
    const tabId = "tabId" in command ? command.tabId : session.activeTabId;
    const active = tabId ? await session.ensureTab(tabId).catch(() => undefined) : undefined;
    return {
      ...reply,
      elapsedMs: Date.now() - started,
      meta: {
        browserUse: true,
        backendType: "cdp",
        browserId,
        browserGeneration: generation,
        openTabIds: session.tabIds,
        ...(active
          ? { tabId: active.id, currentUrl: active.page.url(), lifecycle: "active" as const }
          : {}),
      },
    };
  }

  async function execute(input: BrowserControlExecuteInput): Promise<BrowserCommandResult> {
    const started = Date.now();
    if (input.browserId !== browserId || input.browserGeneration !== generation) {
      return {
        ok: false,
        error: {
          code: "backend_unavailable",
          message: `Browser backend '${input.browserId}' generation ${input.browserGeneration} is stale`,
        },
        elapsedMs: Date.now() - started,
      };
    }
    const requestId = randomUUID();
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(input.signal?.reason ?? abortError());
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (input.signal?.aborted) forwardAbort();
    requests.set(requestId, { sessionId: input.sessionId, turnId: input.turnId, controller });
    let dispatched = false;
    try {
      if (controller.signal.aborted) throw abortError();
      await acquireBrowser(controller.signal);
      const session = await acquireSession(input.sessionId);
      if (controller.signal.aborted) throw abortError();
      dispatched = true;
      const reply = await raceWithAbort(dispatch(session, input.command), controller.signal);
      return await enrich(session, input.command, reply, started);
    } catch (error) {
      const code = classifyError(error);
      return {
        ok: false,
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
          ...(code === "cancelled" && dispatched && hasSideEffects(input.command)
            ? { sideEffect: "uncertain" as const }
            : {}),
        },
        elapsedMs: Date.now() - started,
      };
    } finally {
      input.signal?.removeEventListener("abort", forwardAbort);
      requests.delete(requestId);
    }
  }

  async function list(input: BrowserControlListInput): Promise<BrowserBackendDescriptor[]> {
    await acquireBrowser(input.signal);
    return [createManagedCdpDescriptor(browserId, generation)];
  }

  async function turnEnded(input: BrowserControlListInput): Promise<void> {
    for (const request of requests.values()) {
      if (request.sessionId === input.sessionId && request.turnId === input.turnId) {
        request.controller.abort(abortError());
      }
    }
  }

  async function closeSession(input: BrowserControlListInput): Promise<void> {
    closing.add(input.sessionId);
    for (const request of requests.values()) {
      if (request.sessionId === input.sessionId) request.controller.abort(abortError());
    }
    const admission = admissions.get(input.sessionId);
    if (admission && !(await bounded(admission))) {
      void admission.then(closeIfUnused, closeIfUnused);
    }
    const session = sessions.get(input.sessionId);
    sessions.delete(input.sessionId);
    if (session) await bounded(session.close());
    await closeIfUnused();
  }

  async function close(): Promise<void> {
    if (disposed) return;
    disposed = true;
    const pendingLaunch = launching;
    for (const request of requests.values()) request.controller.abort(abortError());
    requests.clear();
    closing.clear();
    await Promise.all([...admissions.values()].map((admission) => bounded(admission)));
    await Promise.all([...sessions.values()].map((session) => bounded(session.close())));
    sessions.clear();
    await closeOwnedBrowser();
    if (pendingLaunch) await bounded(pendingLaunch.then(closeInstance));
  }

  return { browserControlPort: { list, execute, turnEnded, closeSession }, close };
}
