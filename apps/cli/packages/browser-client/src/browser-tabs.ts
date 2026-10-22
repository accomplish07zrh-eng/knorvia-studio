// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BrowserCommand,
  BrowserTabSummary,
  BrowserUserTabInfo,
} from "@knorvia/contracts/browser-control";
import type {
  BrowserCapabilityInfo,
  BrowserExecuteFn,
  BrowserHistoryEntry,
  BrowserHistoryOptions,
  BrowserTabInfo,
} from "./facade-contract.js";
import { Tab } from "./tab.js";
import { expectOk, expectPayload } from "./result.js";
import { selectTabForUrl } from "./selection.js";
import { unavailable } from "./browser-objects.js";

type WrapTab = (tab: Tab) => Tab;
type Documents = (name?: string) => string;
export class BrowserTabs {
  #send: BrowserExecuteFn;
  #wrap: WrapTab;
  #capabilities: readonly BrowserCapabilityInfo[];
  #documents: Documents;
  constructor(
    execute: BrowserExecuteFn,
    wrapTab: WrapTab = (tab) => tab,
    capabilities: readonly BrowserCapabilityInfo[] = [],
    readCapabilityDocumentation: Documents = () => "",
  ) {
    this.#send = execute;
    this.#wrap = wrapTab;
    this.#capabilities = capabilities;
    this.#documents = readCapabilityDocumentation;
  }
  #tab(summary: BrowserTabSummary): Tab {
    return this.#wrap(
      new Tab(this.#send, summary.tabId, summary, this.#capabilities, this.#documents),
    );
  }
  async #summaries(): Promise<BrowserTabSummary[]> {
    const command = { method: "list" as const };
    return expectOk(command, await this.#send(command)).tabs ?? [];
  }
  async #fromCommand(command: BrowserCommand): Promise<Tab> {
    const result = await this.#send(command);
    return this.#tab(expectPayload(command, result, result.tab, "tab"));
  }
  async list(): Promise<BrowserTabInfo[]> {
    return (await this.#summaries()).map((tab) => ({
      id: tab.tabId,
      viewport: { ...tab.viewport },
      ...(tab.active ? { active: true } : {}),
      title: tab.title,
      url: tab.url,
    }));
  }
  async selected(): Promise<Tab | undefined> {
    const tabs = await this.#summaries();
    const selected = tabs.find((tab) => tab.active) ?? tabs.at(-1);
    return selected ? this.#tab(selected) : undefined;
  }
  async get(tabId: string): Promise<Tab> {
    if (!(await this.#summaries()).some((tab) => tab.tabId === tabId))
      throw unavailable(`Browser tab '${tabId}' is unavailable`);
    return this.#fromCommand({ method: "activateTab", tabId });
  }
  new(): Promise<Tab> {
    return this.#fromCommand({ method: "newTab" });
  }
  async reuse(url: string): Promise<Tab | undefined> {
    const selected = selectTabForUrl(url, await this.#summaries());
    return selected
      ? this.#fromCommand({ method: "activateTab", tabId: selected.tabId })
      : undefined;
  }
  async finalize(options?: {
    keep?: Array<{ tab: string | Tab | { id: string }; status: "handoff" | "deliverable" }>;
  }): Promise<void> {
    const command = {
      method: "finalizeTabs" as const,
      keep: (options?.keep ?? []).map((item) => ({
        tabId: typeof item.tab === "string" ? item.tab : item.tab.id,
        status: item.status,
      })),
    };
    expectOk(command, await this.#send(command));
  }
}

export class BrowserUser {
  #send: BrowserExecuteFn;
  #wrap: WrapTab;
  #capabilities: readonly BrowserCapabilityInfo[];
  #documents: Documents;
  constructor(
    execute: BrowserExecuteFn,
    wrapTab: WrapTab,
    capabilities: readonly BrowserCapabilityInfo[] = [],
    readCapabilityDocumentation: Documents = () => "",
  ) {
    this.#send = execute;
    this.#wrap = wrapTab;
    this.#capabilities = capabilities;
    this.#documents = readCapabilityDocumentation;
  }
  async openTabs(): Promise<BrowserUserTabInfo[]> {
    const command = { method: "listUserTabs" as const };
    return expectOk(command, await this.#send(command)).userTabs ?? [];
  }
  async claimTab(tab: string | BrowserUserTabInfo): Promise<Tab> {
    const command = { method: "claimTab" as const, tabId: typeof tab === "string" ? tab : tab.id };
    const result = await this.#send(command);
    const summary = expectPayload(command, result, result.tab, "tab");
    return this.#wrap(
      new Tab(this.#send, summary.tabId, summary, this.#capabilities, this.#documents),
    );
  }
  async history(_options?: BrowserHistoryOptions): Promise<BrowserHistoryEntry[]> {
    throw new Error("Browser history is unavailable for the iab backend");
  }
}
