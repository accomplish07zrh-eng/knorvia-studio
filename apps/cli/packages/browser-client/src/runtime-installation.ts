// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { BrowsersFacade } from "./browser-registry.js";
import type { BrowserAvailabilityGuard, BrowserClientTransport } from "./facade-contract.js";
import { loadBrowserDocumentation } from "./documentation.js";

export interface BrowserRuntimeOptions {
  globals: Record<string, unknown>;
  transport: BrowserClientTransport;
  documentationRoot?: string;
  assertAvailable?: BrowserAvailabilityGuard;
}
interface Documents {
  get(name: string): Promise<string>;
}
interface AgentNamespace {
  browsers?: BrowsersFacade;
  documentation?: Documents;
}

function namespace(globals: Record<string, unknown>): AgentNamespace {
  if (globals.agent == null) globals.agent = {};
  const value = globals.agent;
  if (typeof value !== "object" && typeof value !== "function")
    throw new TypeError("The agent namespace must be an object");
  return value as AgentNamespace;
}

function documentRouter(options: BrowserRuntimeOptions, previous?: Documents): Documents {
  const getPrevious = previous?.get;
  return Object.freeze({
    async get(name: string): Promise<string> {
      options.assertAvailable?.();
      if (!name) throw new TypeError("agent.documentation.get requires a document name");
      if (name === "computer-use" && getPrevious) {
        // 旧入口拆出 get 后直接调用，丢失提供者的 this；委托必须保留原对象。
        return Reflect.apply(getPrevious, previous, [name]) as Promise<string>;
      }
      return loadBrowserDocumentation(options.documentationRoot, name);
    },
  });
}

export function setupBrowserRuntime(options: BrowserRuntimeOptions): void {
  options.assertAvailable?.();
  const agent = namespace(options.globals);
  const documents = documentRouter(options, agent.documentation);
  const browsers = new BrowsersFacade(options.transport, {
    documentationRoot: options.documentationRoot,
    assertAvailable: options.assertAvailable,
  }).asRuntimeObject();
  agent.browsers = browsers;
  agent.documentation = documents;
}
