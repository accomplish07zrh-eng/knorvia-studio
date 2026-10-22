// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";
import type {
  BrowserApiManifest,
  BrowserApiManifestMember,
  BrowserApiRequirement,
} from "./api-contract.js";

export class BrowserApiPolicy {
  readonly manifest: BrowserApiManifest;
  #members = new Map<string, Map<string, BrowserApiManifestMember>>();
  #descriptor: BrowserBackendDescriptor;
  #browser = new Set<string>();
  #tab = new Set<string>();

  constructor(manifest: BrowserApiManifest, descriptor: BrowserBackendDescriptor) {
    this.manifest = manifest;
    for (const [name, definition] of Object.entries(manifest.objects)) {
      this.#members.set(name, new Map(definition.members.map((member) => [member.name, member])));
    }
    this.#descriptor = descriptor;
    this.updateDescriptor(descriptor);
  }

  updateDescriptor(descriptor: BrowserBackendDescriptor): void {
    this.#descriptor = descriptor;
    this.#browser = new Set(descriptor.capabilities.browser?.map((capability) => capability.id));
    this.#tab = new Set(descriptor.capabilities.tab?.map((capability) => capability.id));
  }

  isKnown(objectName: string, memberName: string): boolean {
    return this.#members.get(objectName)?.has(memberName) ?? false;
  }

  supports(objectName: string, memberName: string): boolean {
    const member = this.#members.get(objectName)?.get(memberName);
    if (!member) return true;
    const override = this.#descriptor.apiSupportOverrides?.[`${objectName}.${memberName}`];
    if (typeof override === "boolean") return override;
    return (
      this.#satisfies(member) &&
      (!member.declarations?.length ||
        member.declarations.some((declaration) => this.#satisfies(declaration)))
    );
  }

  supportedMembers(objectName: string): BrowserApiManifestMember[] {
    return (this.manifest.objects[objectName]?.members ?? [])
      .filter((member) => this.supports(objectName, member.name))
      .map((member) => ({
        ...member,
        ...(member.declarations
          ? {
              declarations: member.declarations.filter((declaration) =>
                this.#satisfies(declaration),
              ),
            }
          : {}),
      }));
  }

  #satisfies(requirement: BrowserApiRequirement): boolean {
    if (requirement.unsupportedByDefaultIn?.includes(this.#descriptor.type)) return false;
    return (requirement.requiresCapabilities ?? []).every((id) => {
      if (id.startsWith("browser:")) return this.#browser.has(id.slice(8));
      if (id.startsWith("tab:")) return this.#tab.has(id.slice(4));
      return this.#browser.has(id) || this.#tab.has(id);
    });
  }
}

export function createBrowserApiProxy<T extends object>(
  target: T,
  objectName: string,
  policy: BrowserApiPolicy,
  options: { hideUnknown?: boolean } = {},
): T {
  const visible = (key: string | symbol) =>
    typeof key === "symbol" ||
    ((!options.hideUnknown || policy.isKnown(objectName, key)) && policy.supports(objectName, key));
  return new Proxy(target, {
    get(object, key, receiver) {
      if (!visible(key)) return undefined;
      const value = Reflect.get(object, key, options.hideUnknown ? object : receiver);
      // 绑定原对象，让私有字段与内部方法调用不会再次经过 hideUnknown 过滤。
      return options.hideUnknown && typeof value === "function" ? value.bind(object) : value;
    },
    has: (object, key) => visible(key) && Reflect.has(object, key),
    ownKeys: (object) => Reflect.ownKeys(object).filter(visible),
    getOwnPropertyDescriptor: (object, key) =>
      visible(key) ? Reflect.getOwnPropertyDescriptor(object, key) : undefined,
  });
}
