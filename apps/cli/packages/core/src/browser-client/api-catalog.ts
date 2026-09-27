// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserApiManifest, BrowserApiManifestMember } from "./api-contract.js";

type Options = Partial<Omit<BrowserApiManifestMember, "name" | "signature" | "kind">>;
const methods = (signatures: string[], options: Options = {}): BrowserApiManifestMember[] =>
  signatures.map((signature) => ({
    ...options,
    name: signature.slice(0, signature.indexOf("(")),
    kind: "method",
    signature,
  }));
const fields = (signatures: string[]): BrowserApiManifestMember[] =>
  signatures.map((signature) => ({
    name: signature.slice(0, signature.indexOf(":")),
    kind: "property",
    signature,
  }));

/** Reconstruct the fallback public interface, with fresh data for each caller. */
export function createBrowserApiCatalog(): BrowserApiManifest {
  const extensionOnly: Options = { unsupportedByDefaultIn: ["iab", "cdp"] };
  const internalOnly: Options = { unsupportedByDefaultIn: ["extension", "cdp"] };
  const playwright: Options = { command: "playwright" };
  const queryMethods = [
    "getByLabel(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator",
    "getByPlaceholder(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator",
    "getByRole(role: string, options?: { name?: TextMatcher; exact?: boolean }): PlaywrightLocator",
    "getByTestId(testId: string): PlaywrightLocator",
    "getByText(text: TextMatcher, options?: { exact?: boolean }): PlaywrightLocator",
    "locator(selector: string): PlaywrightLocator",
  ];
  const objects: Record<string, BrowserApiManifestMember[]> = {
    Agent: fields(["browsers: Browsers", "documentation: Documentation"]),
    Documentation: methods(["get(name: string): Promise<string>"]),
    Browsers: methods([
      "list(): Promise<BrowserDescriptor[]>",
      "get(idOrType: string): Promise<Browser>",
      "getDefault(): Promise<Browser>",
      "getForUrl(url: string): Promise<Browser>",
      "open(url?: string, options?: { reuseTab?: boolean }): Promise<Tab>",
    ]),
    Browser: [
      ...fields([
        "browserId: string",
        "capabilities: BrowserCapabilityCollection",
        "tabs: Tabs",
        "user: BrowserUser",
      ]),
      ...methods(["documentation(): Promise<string>", "nameSession(name: string): Promise<void>"]),
    ],
    BrowserUser: [
      ...methods(["claimTab(tab: string | { id: string }): Promise<Tab>"], extensionOnly),
      ...methods(["history(options?: BrowserHistoryOptions): Promise<BrowserHistoryEntry[]>"], {
        unsupportedByDefaultIn: ["iab"],
      }),
      ...methods(["openTabs(): Promise<BrowserUserTabInfo[]>"]),
    ],
    Tabs: [
      ...methods([
        "get(tabId: string): Promise<Tab>",
        "new(): Promise<Tab>",
        "selected(): Promise<Tab | undefined>",
        "list(): Promise<TabInfo[]>",
      ]),
      ...methods(["finalize(options?: FinalizeTabsOptions): Promise<void>"], extensionOnly),
    ],
    Tab: [
      ...fields([
        "id: string",
        "capabilities: TabCapabilityCollection",
        "cua: CUAAPI",
        "dom_cua: DomCUAAPI",
        "playwright: PlaywrightAPI",
        "recording: BrowserRecordingAPI",
      ]),
      ...methods([
        "back(): Promise<void>",
        "close(): Promise<void>",
        "forward(): Promise<void>",
        "getJsDialog(): Promise<JsDialog | undefined>",
        "goto(url: string): Promise<void>",
        "reload(): Promise<void>",
        "screenshot(options?: { clip?: { x: number; y: number; width: number; height: number }; fullPage?: boolean }): Promise<Uint8Array>",
        "title(): Promise<string | undefined>",
        "url(): Promise<string | undefined>",
        "viewportSize(): BrowserViewportSize | null",
      ]),
      ...methods(
        [
          "finalize(options?: { deliverable?: boolean }): Promise<void>",
          "markDeliverable(): Promise<void>",
          "markHandoff(): Promise<void>",
        ],
        extensionOnly,
      ),
      ...methods(["setViewportSize(viewportSize: BrowserViewportSize): Promise<void>"], {
        command: "browserViewportSet",
      }),
    ],
    BrowserRecordingAPI: [
      ...methods(["start(options?: BrowserRecordingOptions): Promise<BrowserRecordingJob>"], {
        ...internalOnly,
        command: "recordingStart",
      }),
      ...methods(
        [
          "status(recordingId: string, options?: { outputPath?: string }): Promise<BrowserRecordingJob>",
        ],
        { ...internalOnly, command: "recordingStatus" },
      ),
      ...methods(["cancel(recordingId: string): Promise<BrowserRecordingJob>"], {
        ...internalOnly,
        command: "recordingCancel",
      }),
    ],
    BrowserCapabilityCollection: methods([
      "get(id: string): Promise<BrowserCapability>",
      "list(): Promise<BrowserCapabilityInfo[]>",
    ]),
    TabCapabilityCollection: methods([
      "get(id: string): Promise<BrowserCapability>",
      "list(): Promise<BrowserCapabilityInfo[]>",
    ]),
    PlaywrightAPI: [
      ...methods(
        [
          "domSnapshot(): Promise<string>",
          "evaluate(pageFunction, arg?, options?): Promise<TResult>",
          "expectNavigation(action, options?): Promise<T>",
          "waitForLoadState(options?): Promise<void>",
          "waitForURL(url: string, options?): Promise<void>",
        ],
        playwright,
      ),
      ...methods(
        [
          "elementInfo(options: ElementInfoOptions): Promise<ElementInfo[]>",
          "elementScreenshot(options: ElementScreenshotOptions): Promise<Uint8Array>",
        ],
        { ...playwright, documented: false },
      ),
      ...methods(["frameLocator(selector: string): PlaywrightFrameLocator", ...queryMethods]),
      ...methods(
        ["waitForEvent(event, options?): Promise<PlaywrightDownload | PlaywrightFileChooser>"],
        {
          ...playwright,
          declarations: [
            { signature: 'waitForEvent(event: "download", options?): Promise<PlaywrightDownload>' },
            {
              signature:
                'waitForEvent(event: "filechooser", options?): Promise<PlaywrightFileChooser>',
              unsupportedByDefaultIn: ["iab"],
            },
          ],
        },
      ),
      ...methods(["waitForTimeout(timeoutMs: number): Promise<void>"], {
        command: "playwrightWaitForTimeout",
      }),
    ],
    PlaywrightFrameLocator: methods([
      "frameLocator(selector: string): PlaywrightFrameLocator",
      ...queryMethods,
    ]),
    PlaywrightLocator: [
      ...methods([
        "all(): Promise<PlaywrightLocator[]>",
        "and(locator: PlaywrightLocator): PlaywrightLocator",
        "or(locator: PlaywrightLocator): PlaywrightLocator",
        "filter(options?: LocatorFilterOptions): PlaywrightLocator",
        "first(): PlaywrightLocator",
        "last(): PlaywrightLocator",
        "nth(index: number): PlaywrightLocator",
        ...queryMethods,
      ]),
      ...methods(
        [
          "allTextContents(options?): Promise<string[]>",
          "check(options?): Promise<void>",
          "uncheck(options?): Promise<void>",
          "click(options?): Promise<void>",
          "dblclick(options?): Promise<void>",
          "count(): Promise<number>",
          "downloadMedia(options?): Promise<void>",
          "evaluate(pageFunction, arg?, options?): Promise<TResult>",
          "fill(value: string, options?): Promise<void>",
          "type(value: string, options?): Promise<void>",
          "press(value: string, options?): Promise<void>",
          "selectOption(input: SelectOptionInput | SelectOptionInput[], options?): Promise<void>",
          "setChecked(checked: boolean, options?): Promise<void>",
          "waitFor(options: LocatorWaitForOptions): Promise<void>",
          "getAttribute(name: string, options?): Promise<string | null>",
          "innerText(options?): Promise<string>",
          "textContent(options?): Promise<string | null>",
          "isEnabled(): Promise<boolean>",
          "isVisible(): Promise<boolean>",
        ],
        playwright,
      ),
    ],
    PlaywrightDownload: methods(["path(options?): Promise<string | null>"], {
      ...playwright,
      documented: false,
    }),
    PlaywrightFileChooser: [
      ...methods(["isMultiple(): boolean"]),
      ...methods(["setFiles(files: string | string[], options?): Promise<void>"], {
        ...playwright,
        unsupportedByDefaultIn: ["iab"],
      }),
    ],
    CUAAPI: [
      ...methods([
        "click(options): Promise<void>",
        "double_click(options): Promise<void>",
        "drag(options): Promise<void>",
        "keypress(options): Promise<void>",
        "move(options): Promise<void>",
        "scroll(options): Promise<void>",
        "type(options): Promise<void>",
      ]),
      ...methods(["downloadMedia(options): Promise<void>"], {
        unsupportedByDefaultIn: ["iab"],
        documented: false,
      }),
    ],
    DomCUAAPI: [
      ...methods([
        "click(options): Promise<void>",
        "double_click(options): Promise<void>",
        "get_visible_dom(): Promise<BrowserSnapshot>",
        "keypress(options): Promise<void>",
        "scroll(options): Promise<void>",
        "type(options): Promise<void>",
      ]),
      ...methods(["downloadMedia(options): Promise<void>"], {
        unsupportedByDefaultIn: ["iab"],
        documented: false,
      }),
    ],
    AlertDialog: [...fields(['type: "alert"']), ...methods(["dismiss(): Promise<void>"])],
    BeforeUnloadDialog: [
      ...fields(['type: "beforeunload"']),
      ...methods(["dismiss(): Promise<void>"]),
    ],
    ConfirmDialog: [
      ...fields(['type: "confirm"']),
      ...methods(["accept(): Promise<void>", "dismiss(): Promise<void>"]),
    ],
    PromptDialog: [
      ...fields(['type: "prompt"']),
      ...methods(["accept(text: string): Promise<void>", "dismiss(): Promise<void>"]),
    ],
  };
  return {
    version: 12,
    types: {
      BrowserViewportSize: "{ width: number; height: number }",
      TabInfo:
        "{ id: string; active?: boolean; title?: string; url?: string; viewport: BrowserViewportSize }",
    },
    objects: Object.fromEntries(
      Object.entries(objects).map(([name, members]) => [name, { members }]),
    ),
  };
}
