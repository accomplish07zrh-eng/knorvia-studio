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
import type {
  BrowserBackendDescriptor,
  BrowserCommand,
  BrowserCommandResult,
} from "@knorvia/contracts/browser-control";

/** 用来触发「一个后端都没有」诊断的探针 id：它一定匹配不到，从而走不可用路径。 */
const NO_BACKEND_PROBE = "__no_browser_backend__";

/** 执行一条浏览器命令（注入给 Browser 的回调）。 */
type ExecuteCommand = (
  id: string,
  generation: number,
  command: BrowserCommand,
) => Promise<BrowserCommandResult>;

/** 读一份文档（注入给 Browser 的回调）；参数类型取自实现去掉首参 root，避免手抄漂移。 */
type DocumentationReader = (name?: string, descriptor?: BrowserBackendDescriptor) => string;

/** 对外描述里不含 generation —— 它是内部用来判断缓存是否作废的代次号。 */
function toDescriptor(info: BrowserInfo): BrowserDescriptor {
  // generation 是内部代次号，不进对外描述；其余字段原样保留。
  const pairs = Object.entries(info).filter(([key]) => key !== "generation");
  return Object.fromEntries(pairs) as BrowserDescriptor;
}

/** 视图策略的初始身份：查询类操作不针对某个具体后端，所以字段留空。 */
/** 查询类操作不针对某个具体后端，所以策略身份留空；generation 用 -1 表示「尚无后端」。 */
function emptyBrowserIdentity() {
  return { id: "", type: "iab" as const, generation: -1, name: "", capabilities: {} };
}

export class BrowsersFacade {
  /** 构造后不变的外部依赖：活性判断、传输层、文档根与 API 清单。 */
  #deps: {
    guard: BrowserAvailabilityGuard;
    transport: BrowserClientTransport;
    documentRoot?: string;
    manifest: BrowserApiManifest;
  };

  /** 运行期状态：按 id 缓存的浏览器句柄，以及给运行时用的受控视图。 */
  #live: { browsers: Map<string, Browser>; view: BrowsersFacade };
  constructor(
    transport: BrowserClientTransport,
    options: { documentationRoot?: string; assertAvailable?: BrowserAvailabilityGuard } = {},
  ) {
    const manifest = loadBrowserApiManifest(options.documentationRoot);
    this.#deps = {
      guard: options.assertAvailable ?? (() => {}),
      transport,
      documentRoot: options.documentationRoot,
      manifest,
    };
    // 视图用的策略从一个「空身份」开始：查询类操作没有具体后端可言。
    const policy = new BrowserApiPolicy(manifest, emptyBrowserIdentity());
    this.#live = {
      browsers: new Map<string, Browser>(),
      view: policyObject(this, "Browsers", policy, true),
    };
  }
  asRuntimeObject(): BrowsersFacade {
    return this.#live.view;
  }
  async #discover(): Promise<BrowserInfo[]> {
    this.#deps.guard();
    return this.#deps.transport.list();
  }
  /**
   * 按「代次缓存」取一个浏览器句柄。
   *
   * 同一 id 且 generation 相同时复用已有句柄（只刷新描述信息）；
   * generation 变化意味着后端重启过，旧句柄与它持有的连接都作废，必须重建。
   */
  #browser(info: BrowserInfo): Browser {
    const cached = this.#live.browsers.get(info.id);
    const stale = cached === undefined || cached.generation !== info.generation;
    if (!stale) {
      cached.updateInfo(info);
      return cached.asRuntimeObject();
    }
    const execute: ExecuteCommand = (id, generation, command) =>
      this.#deps.transport.execute(id, generation, command);
    const created = new Browser(
      info,
      execute,
      this.#documentationReader(),
      this.#deps.manifest,
      this.#deps.guard,
    );
    this.#live.browsers.set(info.id, created);
    return created.asRuntimeObject();
  }

  /** 读文档的回调：先过活性判断，再按文档根解析。 */
  #documentationReader(): DocumentationReader {
    return (name, descriptor) => {
      this.#deps.guard();
      return loadBrowserDocumentation(this.#deps.documentRoot, name, descriptor);
    };
  }
  async list(): Promise<BrowserDescriptor[]> {
    return (await this.#discover()).map(toDescriptor);
  }
  async get(idOrType: string): Promise<Browser> {
    const infos = await this.#discover();
    const matched = this.#matchBrowser(infos, idOrType);
    if (matched === undefined) throw unavailable(this.#unavailableMessage(idOrType, infos));
    return this.#browser(matched);
  }

  /** 取默认浏览器后执行一个动作 —— 三个「面向当前浏览器」的方法共用这条前置。 */
  async #onDefault<T>(action: (browser: Browser) => Promise<T> | T): Promise<T> {
    const browser = await this.getDefault();
    return action(browser);
  }

  /** 先按 id 精确匹配，再按 type 匹配（同一个 type 可能有多个实例）。 */
  #matchBrowser(infos: readonly BrowserInfo[], idOrType: string): BrowserInfo | undefined {
    return (
      infos.find((item) => item.id === idOrType) ?? infos.find((item) => item.type === idOrType)
    );
  }

  /** 不可用时的诊断文案：有可用后端就列出来，便于直接看出该填哪个。 */
  #unavailableMessage(idOrType: string, infos: readonly BrowserInfo[]): string {
    const base = `Browser backend '${idOrType}' is unavailable`;
    if (infos.length === 0) return base;
    const names = infos.map((item) => `${item.type}:${item.id}`).join(", ");
    return `${base}; available: ${names}`;
  }
  async getDefault(): Promise<Browser> {
    const chosen = selectDefaultBrowser(await this.#discover());
    return chosen === undefined ? this.get(NO_BACKEND_PROBE) : this.#browser(chosen);
  }
  async getForUrl(url: string): Promise<Browser> {
    const infos = await this.#discover();
    // 没有后端时走 get 的「不可用」诊断；只有一个时无需按 URL 选。
    if (infos.length <= 1) {
      return infos.length === 0 ? this.get(NO_BACKEND_PROBE) : this.#browser(infos[0]!);
    }
    const tabs = await this.#tabUrlsByBrowser(infos);
    return this.#browser(selectBrowserForUrl(infos, url, tabs));
  }

  /**
   * 并发问每个浏览器「你开着哪些 URL」。
   *
   * 某个后端列标签页失败时按「空列表」参与选择 —— 失败不是错误：
   * 选择只需要知道「它没有可用 URL」，而让一个后端失败拖垮整体选择更糟。
   */
  async #tabUrlsByBrowser(infos: readonly BrowserInfo[]): Promise<Map<string, readonly string[]>> {
    const collected = new Map<string, readonly string[]>();
    await Promise.all(
      infos.map(async (info) => {
        collected.set(info.id, await this.#urlsOfOne(info));
      }),
    );
    return collected;
  }

  /** 单个浏览器的 URL 列表（读失败按空）。 */
  async #urlsOfOne(info: BrowserInfo): Promise<readonly string[]> {
    try {
      const tabs = await this.#browser(info).tabs.list();
      return tabs.flatMap((tab) => (tab.url ? [tab.url] : []));
    } catch {
      // 读不到就当作「这个后端没有可用 URL」。
      return [];
    }
  }
  async open(url?: string, options: { reuseTab?: boolean } = {}): Promise<Tab> {
    return this.#onDefault(async (browser) => {
      const tab = await this.#reuseOrCreateTab(browser, url, options);
      if (url !== undefined) await tab.goto(url);
      return tab;
    });
  }

  /**
   * 取一个标签页：能复用就复用，复用失败不报错而是新建。
   *
   * 复用失败通常意味着那个标签页已被关掉或换了页面；
   * 目标只是「有一个能打开 url 的标签页」，所以退回新建即可。
   */
  async #reuseOrCreateTab(
    browser: Browser,
    url: string | undefined,
    options: { reuseTab?: boolean },
  ): Promise<Tab> {
    const wantsReuse = url !== undefined && options.reuseTab !== false;
    if (wantsReuse) {
      try {
        const reused = await browser.tabs.reuse(url);
        if (reused !== undefined) return reused;
      } catch {
        // 复用失败按「没有可复用标签页」处理。
      }
    }
    return browser.tabs.new();
  }
  async current(): Promise<Tab> {
    return this.#onDefault(async (browser) => {
      const selected = await browser.tabs.selected();
      return selected ?? browser.tabs.new();
    });
  }
  async listTabs(): Promise<Tab[]> {
    return this.#onDefault(async (browser) => {
      const tabs = await browser.tabs.list();
      return tabs.map((tab) => browser.createTab(tab.id));
    });
  }
  tab(tabId: string): Tab {
    // 这里必须同步返回 Tab；命令真正执行时才用到底层浏览器。
    const pending = this.getDefault();
    const run = async (command: BrowserCommand) => (await pending).executeCommand(command);
    return new Tab(run, tabId);
  }
  documentation(name?: string): string {
    this.#deps.guard();
    return loadBrowserDocumentation(this.#deps.documentRoot, name);
  }
}
