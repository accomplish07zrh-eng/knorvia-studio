import { randomUUID } from "node:crypto";
import type { BrowserTabSummary } from "@knorvia/contracts";
import type { BrowserContext, Dialog, Page, ViewportSize } from "playwright-core";

const DEFAULT_VIEWPORT: ViewportSize = { width: 1280, height: 720 };
const TAB_PREFIX = "tab:";
const TAB_LIFECYCLE = "active" as const;
const EMPTY_TITLE = "";

type TabHandle = { id: string; page: Page };

export class ManagedCdpSession {
  readonly #ownedTabs = new Map<string, TabHandle>();
  readonly #pendingDialogs = new Map<string, Dialog>();
  #selectedId: string | undefined;

  constructor(readonly context: BrowserContext) {
    for (const page of context.pages()) {
      this.#registerPage(page);
    }
    context.on("page", (page) => {
      this.#registerPage(page);
    });
  }

  get tabIds(): string[] {
    return Array.from(this.#ownedTabs.keys());
  }

  get activeTabId(): string | undefined {
    return this.#selectedId;
  }

  async createTab(): Promise<TabHandle> {
    const page = await this.context.newPage();
    const tab = this.#registerPage(page);
    this.#selectedId = tab.id;
    await page.bringToFront();
    return tab;
  }

  async ensureTab(tabId?: string): Promise<TabHandle> {
    if (tabId) {
      const tab = this.#ownedTabs.get(tabId);
      if (!tab || tab.page.isClosed()) {
        throw new Error(`Browser tab '${tabId}' is unavailable`);
      }
      return tab;
    }
    if (this.#selectedId !== undefined) {
      const selected = this.#ownedTabs.get(this.#selectedId);
      if (selected && !selected.page.isClosed()) {
        return selected;
      }
    }
    for (const tab of this.#ownedTabs.values()) {
      if (!tab.page.isClosed()) {
        return tab;
      }
    }
    return this.createTab();
  }

  async activateTab(tabId: string): Promise<TabHandle> {
    const tab = await this.ensureTab(tabId);
    this.#selectedId = tab.id;
    await tab.page.bringToFront();
    return tab;
  }

  async closeTab(tabId?: string): Promise<void> {
    const tab = await this.ensureTab(tabId);
    this.#pendingDialogs.delete(tab.id);
    this.#ownedTabs.delete(tab.id);
    if (!tab.page.isClosed()) {
      await tab.page.close({ runBeforeUnload: false });
    }
    if (this.#selectedId === tab.id) {
      this.#selectedId = this.#lastOwnedId();
    }
  }

  async listTabs(): Promise<BrowserTabSummary[]> {
    const summaries: BrowserTabSummary[] = [];
    for (const tab of this.#ownedTabs.values()) {
      if (tab.page.isClosed()) {
        continue;
      }
      summaries.push({
        tabId: tab.id,
        url: tab.page.url(),
        title: await tab.page.title().catch(() => EMPTY_TITLE),
        viewport: tab.page.viewportSize() ?? DEFAULT_VIEWPORT,
        ...(tab.id === this.#selectedId ? { active: true } : {}),
        lifecycle: TAB_LIFECYCLE,
      });
    }
    return summaries;
  }

  dialogFor(tabId: string): Dialog | undefined {
    return this.#pendingDialogs.get(tabId);
  }

  clearDialog(tabId: string): void {
    this.#pendingDialogs.delete(tabId);
  }

  async setViewport(tabId: string | undefined, viewport: ViewportSize | null): Promise<void> {
    const tab = await this.ensureTab(tabId);
    await tab.page.setViewportSize(viewport ?? DEFAULT_VIEWPORT);
  }

  async close(): Promise<void> {
    this.#pendingDialogs.clear();
    this.#ownedTabs.clear();
    if (!this.context.browser()?.isConnected()) {
      return;
    }
    await this.context.close().catch(() => undefined);
  }

  #registerPage(page: Page): TabHandle {
    for (const tab of this.#ownedTabs.values()) {
      if (tab.page === page) {
        return tab;
      }
    }
    const tab: TabHandle = { id: `${TAB_PREFIX}${randomUUID()}`, page };
    this.#ownedTabs.set(tab.id, tab);
    if (this.#selectedId === undefined) {
      this.#selectedId = tab.id;
    }
    page.on("dialog", (dialog) => {
      this.#pendingDialogs.set(tab.id, dialog);
    });
    page.on("close", () => {
      this.#pendingDialogs.delete(tab.id);
      this.#ownedTabs.delete(tab.id);
      if (this.#selectedId === tab.id) {
        this.#selectedId = this.#lastOwnedId();
      }
    });
    return tab;
  }

  #lastOwnedId(): string | undefined {
    let last: string | undefined;
    for (const id of this.#ownedTabs.keys()) {
      last = id;
    }
    return last;
  }
}
