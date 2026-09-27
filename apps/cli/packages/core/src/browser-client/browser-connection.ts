// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/contracts/browser-control";
import type {
  BrowserAvailabilityGuard,
  BrowserInfo,
  BrowserTransportExecuteFn,
} from "./facade-contract.js";
import { BrowserApiPolicy, type BrowserApiManifest } from "./manifest.js";
import { BrowserTabs, BrowserUser } from "./browser-tabs.js";
import { BrowserCapabilityCollection } from "./browser-capabilities.js";
import { Tab } from "./tab.js";
import { policyObject } from "./browser-objects.js";
import { expectOk } from "./result.js";

export class Browser {
  readonly tabs: BrowserTabs;
  readonly user: BrowserUser;
  readonly capabilities: BrowserCapabilityCollection;
  #info: BrowserInfo;
  #transport: BrowserTransportExecuteFn;
  #guard: BrowserAvailabilityGuard;
  #documents: (name?: string, descriptor?: BrowserInfo) => string;
  #policy: BrowserApiPolicy;
  #default: Tab;
  #view: Browser;
  constructor(
    info: BrowserInfo,
    execute: BrowserTransportExecuteFn,
    readDocumentation: (name?: string, descriptor?: BrowserInfo) => string,
    manifest: BrowserApiManifest,
    assertAvailable: BrowserAvailabilityGuard = () => {},
  ) {
    this.#info = info;
    this.#transport = execute;
    this.#guard = assertAvailable;
    this.#documents = readDocumentation;
    this.#policy = new BrowserApiPolicy(manifest, info);
    const send = (command: BrowserCommand) => this.executeCommand(command);
    const docs = (name?: string) => this.#documents(name, this.#info);
    const wrap = (tab: Tab) => this.#wrapTab(tab);
    this.tabs = policyObject(
      new BrowserTabs(send, wrap, info.capabilities.tab, docs),
      "Tabs",
      this.#policy,
    );
    this.user = policyObject(
      new BrowserUser(send, wrap, info.capabilities.tab, docs),
      "BrowserUser",
      this.#policy,
    );
    this.capabilities = policyObject(
      new BrowserCapabilityCollection(
        () => this.#info.capabilities.browser ?? [],
        docs,
        send,
        assertAvailable,
      ),
      "BrowserCapabilityCollection",
      this.#policy,
    );
    this.#default = this.#wrapTab(new Tab(send, undefined, undefined, info.capabilities.tab, docs));
    this.#view = policyObject(this, "Browser", this.#policy);
  }
  #wrapTab(tab: Tab): Tab {
    return policyObject(tab.applyPlaywrightPolicy(this.#policy), "Tab", this.#policy);
  }
  get browserId(): string {
    return this.#info.id;
  }
  get type() {
    return this.#info.type;
  }
  get generation(): number {
    return this.#info.generation;
  }
  get id(): string {
    return this.browserId;
  }
  get backend() {
    return this.type;
  }
  get default(): Tab {
    return this.#default;
  }
  async documentation(): Promise<string> {
    return this.#documents(undefined, this.#info);
  }
  async nameSession(name: string): Promise<void> {
    const command = { method: "nameSession" as const, name };
    expectOk(command, await this.executeCommand(command));
  }
  updateInfo(info: BrowserInfo): void {
    this.#info = info;
    this.#policy.updateDescriptor(info);
  }
  executeCommand(command: BrowserCommand): Promise<BrowserCommandResult> {
    this.#guard();
    return this.#transport(this.#info.id, this.#info.generation, command);
  }
  createTab(tabId: string): Tab {
    return this.#wrapTab(
      new Tab(
        (command) => this.executeCommand(command),
        tabId,
        undefined,
        this.#info.capabilities.tab,
        (name) => this.#documents(name, this.#info),
      ),
    );
  }
  asRuntimeObject(): Browser {
    return this.#view;
  }
}
