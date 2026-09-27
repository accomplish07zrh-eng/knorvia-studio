// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  BrowserAvailabilityGuard,
  BrowserCapabilityInfo,
  BrowserExecuteFn,
} from "./facade-contract.js";
import { expectOk } from "./result.js";

class BrowserCapability {
  readonly id: string;
  readonly description: string;
  #document: (name?: string) => string;
  constructor(id: string, description: string, readDocumentation: (name?: string) => string) {
    this.id = id;
    this.description = description;
    this.#document = readDocumentation;
  }
  async documentation(): Promise<string> {
    return this.#document(this.id);
  }
}
class VisibilityBrowserCapability extends BrowserCapability {
  #send: BrowserExecuteFn;
  constructor(
    info: BrowserCapabilityInfo,
    readDocumentation: (name?: string) => string,
    execute: BrowserExecuteFn,
  ) {
    super(info.id, info.description, readDocumentation);
    this.#send = execute;
  }
  async get(): Promise<boolean> {
    const command = { method: "browserVisibilityGet" as const };
    const result = expectOk(command, await this.#send(command));
    if (typeof result.value !== "boolean")
      throw new Error("Browser visibility result is missing a boolean value");
    return result.value;
  }
  async set(visible: boolean): Promise<void> {
    const command = { method: "browserVisibilitySet" as const, visible };
    expectOk(command, await this.#send(command));
  }
}
export class BrowserCapabilityCollection {
  #read: () => readonly BrowserCapabilityInfo[];
  #document: (name?: string) => string;
  #send?: BrowserExecuteFn;
  #guard: BrowserAvailabilityGuard;
  constructor(
    read: () => readonly BrowserCapabilityInfo[],
    readDocumentation: (name?: string) => string,
    execute?: BrowserExecuteFn,
    assertAvailable: BrowserAvailabilityGuard = () => {},
  ) {
    this.#read = read;
    this.#document = readDocumentation;
    this.#send = execute;
    this.#guard = assertAvailable;
  }
  async list(): Promise<BrowserCapabilityInfo[]> {
    this.#guard();
    return this.#read().map((item) => ({ ...item }));
  }
  get(id: "visibility"): Promise<VisibilityBrowserCapability>;
  get(id: string): Promise<BrowserCapability>;
  async get(id: string): Promise<BrowserCapability> {
    this.#guard();
    const info = this.#read().find((item) => item.id === id);
    if (!info) throw new Error(`Browser capability '${id}' is unavailable`);
    return id === "visibility" && this.#send
      ? new VisibilityBrowserCapability(info, this.#document, this.#send)
      : new BrowserCapability(info.id, info.description, this.#document);
  }
}
