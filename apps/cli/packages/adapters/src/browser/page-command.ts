import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserKeyModifier,
  BrowserPageState,
  BrowserPoint,
} from "@knorvia/contracts";
import type { ElementHandle, Page } from "playwright-core";
import { evaluatePage, executeManagedPlaywrightAction } from "./playwright-command.js";
import {
  captureManagedCdpSnapshot,
  resolveSnapshotElement,
  resolveSnapshotRef,
} from "./snapshot.js";

const NAVIGATION_TIMEOUT_MS = 30_000;
const EVALUATION_TIMEOUT_MS = 3_000;
const MINIMUM_WAIT_MS = 1;
const DRAG_MOVE_STEPS = 4;
const NAVIGATION_OPTIONS = {
  timeout: NAVIGATION_TIMEOUT_MS,
  waitUntil: "load",
} as const;
const PNG_TYPE = "png" as const;
const PNG_MIME_TYPE = "image/png";

type PageCommandResult = Omit<BrowserCommandResult, "elapsedMs">;

export function isAllowedManagedBrowserUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" || url.href === "about:blank";
  } catch {
    return false;
  }
}

function platformKey(key: string): string {
  return key === "ControlOrMeta" ? (process.platform === "darwin" ? "Meta" : "Control") : key;
}

async function withModifiers<T>(
  page: Page,
  modifiers: readonly BrowserKeyModifier[] | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const keys = (modifiers ?? []).map(platformKey);
  for (const key of keys) await page.keyboard.down(key);
  try {
    return await action();
  } finally {
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      await page.keyboard.up(keys[index]!);
    }
  }
}

async function requiredElement(page: Page, ref: string): Promise<ElementHandle<Element>> {
  const element = await resolveSnapshotElement(page, ref);
  if (!element) {
    throw new Error(
      `Browser ref '${ref}' is stale or unavailable. Take a fresh snapshot before retrying.`,
    );
  }
  return element;
}

async function actionPoint(
  page: Page,
  ref: string | undefined,
  point: BrowserPoint | undefined,
): Promise<BrowserPoint> {
  if (ref) {
    const resolved = await resolveSnapshotRef(page, ref);
    if (!resolved) {
      throw new Error(`Browser ref '${ref}' is stale or unavailable`);
    }
    return resolved;
  }
  if (point) return point;
  throw new Error("Browser action requires a ref or x/y coordinates");
}

async function readPageState(page: Page): Promise<BrowserPageState> {
  const client = await page.context().newCDPSession(page);
  try {
    const history = await client.send("Page.getNavigationHistory");
    const index = history.currentIndex ?? 0;
    const entryCount = history.entries?.length ?? 1;
    const viewport = page.viewportSize();
    const scroll = await page
      .evaluate(() => ({
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
      }))
      .catch(() => ({ scrollX: 0, scrollY: 0 }));
    const url = page.url();
    const title = await page.title().catch(() => "");
    return {
      url,
      title,
      canGoBack: index > 0,
      canGoForward: index + 1 < entryCount,
      ...scroll,
      ...(viewport ? { viewportWidth: viewport.width, viewportHeight: viewport.height } : {}),
    };
  } finally {
    await client.detach().catch(() => undefined);
  }
}

async function pressChord(page: Page, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const mapped = keys.map(platformKey);
  const held = mapped.slice(0, -1);
  for (const key of held) await page.keyboard.down(key);
  try {
    await page.keyboard.press(mapped[mapped.length - 1] ?? "");
  } finally {
    for (let index = held.length - 1; index >= 0; index -= 1) {
      await page.keyboard.up(held[index]!);
    }
  }
}

async function dragPath(page: Page, path: readonly BrowserPoint[]): Promise<void> {
  if (path.length === 0) {
    throw new Error("Browser drag requires a non-empty path");
  }
  const first = path[0]!;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  try {
    for (const point of path.slice(1)) {
      await page.mouse.move(point.x, point.y, { steps: DRAG_MOVE_STEPS });
    }
  } finally {
    await page.mouse.up();
  }
}

export async function executeManagedPageCommand(
  page: Page,
  command: BrowserCommand,
): Promise<PageCommandResult> {
  switch (command.method) {
    case "navigate": {
      if (!isAllowedManagedBrowserUrl(command.url)) {
        return {
          ok: false,
          error: {
            code: "navigation_blocked",
            message: `Navigation URL is not allowed: ${command.url}`,
          },
        };
      }
      await page.goto(command.url, NAVIGATION_OPTIONS);
      return { ok: true, state: await readPageState(page) };
    }
    case "back":
      await page.goBack(NAVIGATION_OPTIONS);
      return { ok: true, state: await readPageState(page) };
    case "forward":
      await page.goForward(NAVIGATION_OPTIONS);
      return { ok: true, state: await readPageState(page) };
    case "reload":
      await page.reload(NAVIGATION_OPTIONS);
      return { ok: true, state: await readPageState(page) };
    case "getState":
      return { ok: true, state: await readPageState(page) };
    case "snapshot":
      return {
        ok: true,
        snapshot: await captureManagedCdpSnapshot(page, command.maxElements, command.includeHidden),
      };
    case "screenshot": {
      const buffer = command.ref
        ? await (
            await requiredElement(page, command.ref)
          ).screenshot({
            type: PNG_TYPE,
          })
        : await page.screenshot({
            type: PNG_TYPE,
            fullPage: command.fullPage,
            clip: command.clip,
          });
      return {
        ok: true,
        image: { base64: buffer.toString("base64"), mimeType: PNG_MIME_TYPE },
      };
    }
    case "click":
    case "hover": {
      const coordinates =
        command.x !== undefined && command.y !== undefined
          ? { x: command.x, y: command.y }
          : undefined;
      const point = await actionPoint(page, command.ref, coordinates);
      await withModifiers(page, command.modifiers, async () => {
        if (command.method === "click") {
          await page.mouse.click(point.x, point.y, {
            button: command.button,
            clickCount: command.doubleClick ? 2 : 1,
          });
        } else {
          await page.mouse.move(point.x, point.y);
        }
      });
      return { ok: true };
    }
    case "fill":
      await (await requiredElement(page, command.ref)).fill(command.value);
      return { ok: true };
    case "type":
      if (command.ref) await (await requiredElement(page, command.ref)).focus();
      await page.keyboard.type(command.text);
      return { ok: true };
    case "press":
      if (command.ref) {
        await (await requiredElement(page, command.ref)).press(command.key);
      } else {
        await withModifiers(page, command.modifiers, () => page.keyboard.press(command.key));
      }
      return { ok: true };
    case "cuaKeypress":
      await pressChord(page, command.keys);
      return { ok: true };
    case "scroll":
      if (command.ref) {
        await (
          await requiredElement(page, command.ref)
        ).evaluate((element) => element.scrollIntoView());
      }
      await page.evaluate(({ x, y }) => window.scrollBy(x, y), {
        x: command.x ?? 0,
        y: command.y ?? 0,
      });
      return { ok: true };
    case "cuaScroll":
      await withModifiers(page, command.modifiers, async () => {
        await page.mouse.move(command.x, command.y);
        await page.mouse.wheel(command.scrollX, command.scrollY);
      });
      return { ok: true };
    case "domCuaScroll": {
      const point = command.nodeId
        ? await actionPoint(page, command.nodeId, undefined)
        : await page.evaluate(() => ({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          }));
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(command.scrollX, command.scrollY);
      return { ok: true };
    }
    case "select":
      await (await requiredElement(page, command.ref)).selectOption(command.values);
      return { ok: true };
    case "check":
      await (await requiredElement(page, command.ref)).setChecked(command.checked ?? true);
      return { ok: true };
    case "drag": {
      const from = await actionPoint(page, command.fromRef, command.from);
      const to = await actionPoint(page, command.toRef, command.to);
      await withModifiers(page, command.modifiers, () => dragPath(page, [from, to]));
      return { ok: true };
    }
    case "cuaDrag":
      await withModifiers(page, command.modifiers, () => dragPath(page, command.path));
      return { ok: true };
    case "elementInfo": {
      const snapshot = await captureManagedCdpSnapshot(page);
      const element = snapshot.elements.find(
        ({ rect }) =>
          command.x >= rect.x &&
          command.x <= rect.x + rect.width &&
          command.y >= rect.y &&
          command.y <= rect.y + rect.height,
      );
      return { ok: true, element };
    }
    case "evaluate":
      return {
        ok: true,
        value: await evaluatePage(
          page,
          command.expression,
          "string",
          undefined,
          EVALUATION_TIMEOUT_MS,
        ),
      };
    case "waitFor": {
      const timeout = Math.min(
        EVALUATION_TIMEOUT_MS,
        Math.max(MINIMUM_WAIT_MS, command.timeoutMs ?? EVALUATION_TIMEOUT_MS),
      );
      if (command.selector) {
        await page.locator(command.selector).waitFor({ timeout, state: "visible" });
      } else if (command.text) {
        await page.getByText(command.text).waitFor({ timeout, state: "visible" });
      } else if (command.textGone) {
        await page.getByText(command.textGone).waitFor({ timeout, state: "hidden" });
      } else {
        throw new Error("waitFor requires selector, text, or textGone");
      }
      return { ok: true };
    }
    case "playwright":
      return executeManagedPlaywrightAction(page, command.action);
    case "playwrightWaitForTimeout":
      await new Promise<void>((resolve) => setTimeout(resolve, command.timeoutMs));
      return { ok: true };
    default:
      return {
        ok: false,
        error: {
          code: "capability_unsupported",
          message: `Browser command '${command.method}' is unavailable in the managed CDP page runtime`,
        },
      };
  }
}
