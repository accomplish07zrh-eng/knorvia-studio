// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserApiManifest } from "./manifest.js";
import { BrowserApiPolicy, loadBrowserApiManifest } from "./manifest.js";
import type {
  BrowserAvailabilityGuard,
  BrowserClientTransport,
  BrowserDescriptor,
  BrowserInfo,
} from "./facade-contract.js";
import { loadBrowserDocumentation } from "./documentation.js";
import { selectBrowserForUrl, selectDefaultBrowser } from "./selection.js";
import { Browser } from "./browser-connection.js";
import { Tab } from "./tab.js";
import { policyObject, unavailable } from "./browser-objects.js";

export class BrowsersFacade {
  #guard: BrowserAvailabilityGuard;
  #transport: BrowserClientTransport;
  #documentRoot?: string;
  #manifest: BrowserApiManifest;
  #browsers = new Map<string, Browser>();
  #view: BrowsersFacade;
  constructor(
    transport: BrowserClientTransport,
    options: { documentationRoot?: string; assertAvailable?: BrowserAvailabilityGuard } = {},
  ) {
    this.#guard = options.assertAvailable ?? (() => {});
    this.#transport = transport;
    this.#documentRoot = options.documentationRoot;
    this.#manifest = loadBrowserApiManifest(options.documentationRoot);
    const policy = new BrowserApiPolicy(this.#manifest, {
      id: "",
      type: "iab",
      generation: 0,
      name: "",
      capabilities: {},
    });
    this.#view = policyObject(this, "Browsers", policy, true);
  }
  asRuntimeObject(): BrowsersFacade {
    return this.#view;
  }
  async #discover(): Promise<BrowserInfo[]> {
    this.#guard();
    return this.#transport.list();
  }
  #browser(info: BrowserInfo): Browser {
    let browser = this.#browsers.get(info.id);
    if (!browser || browser.generation !== info.generation) {
      browser = new Browser(
        info,
        (id, generation, command) => this.#transport.execute(id, generation, command),
        (name, descriptor) => {
          this.#guard();
          return loadBrowserDocumentation(this.#documentRoot, name, descriptor);
        },
        this.#manifest,
        this.#guard,
      );
      this.#browsers.set(info.id, browser);
    } else browser.updateInfo(info);
    return browser.asRuntimeObject();
  }
  async list(): Promise<BrowserDescriptor[]> {
    return (await this.#discover()).map((info) => {
      const { generation: _generation, ...descriptor } = info;
      return descriptor;
    });
  }
  async get(idOrType: string): Promise<Browser> {
    const infos = await this.#discover();
    const info =
      infos.find((item) => item.id === idOrType) ?? infos.find((item) => item.type === idOrType);
    if (!info) {
      const available = infos.length
        ? `; available: ${infos.map((item) => `${item.type}:${item.id}`).join(", ")}`
        : "";
      throw unavailable(`Browser backend '${idOrType}' is unavailable${available}`);
    }
    return this.#browser(info);
  }
  async getDefault(): Promise<Browser> {
    const info = selectDefaultBrowser(await this.#discover());
    if (!info) return this.get("__no_browser_backend__");
    return this.#browser(info);
  }
  async getForUrl(url: string): Promise<Browser> {
    const infos = await this.#discover();
    if (!infos.length) return this.get("__no_browser_backend__");
    if (infos.length === 1) return this.#browser(infos[0]!);
    const tabs = new Map<string, readonly string[]>();
    await Promise.all(
      infos.map(async (info) => {
        try {
          tabs.set(
            info.id,
            (await this.#browser(info).tabs.list()).flatMap((tab) => (tab.url ? [tab.url] : [])),
          );
        } catch {
          tabs.set(info.id, []);
        }
      }),
    );
    return this.#browser(selectBrowserForUrl(infos, url, tabs));
  }
  async open(url?: string, options: { reuseTab?: boolean } = {}): Promise<Tab> {
    const browser = await this.getDefault();
    let tab: Tab | undefined;
    if (url && options.reuseTab !== false) {
      try {
        tab = await browser.tabs.reuse(url);
      } catch {
        /* A failed reuse may recover by creating a new tab. */
      }
    }
    tab ??= await browser.tabs.new();
    if (url) await tab.goto(url);
    return tab;
  }
  async current(): Promise<Tab> {
    const browser = await this.getDefault();
    return (await browser.tabs.selected()) ?? browser.tabs.new();
  }
  async listTabs(): Promise<Tab[]> {
    const browser = await this.getDefault();
    return (await browser.tabs.list()).map((tab) => browser.createTab(tab.id));
  }
  tab(tabId: string): Tab {
    const browser = this.getDefault();
    return new Tab(async (command) => (await browser).executeCommand(command), tabId);
  }
  documentation(name?: string): string {
    this.#guard();
    return loadBrowserDocumentation(this.#documentRoot, name);
  }
}
