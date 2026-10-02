import { readFile } from "node:fs/promises";
import { rootCertificates } from "node:tls";

import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export interface HostApiNetworkOptions {
  httpProxy?: string;
  noProxy?: string;
  caCertPath?: string;
}

export interface HostApiNetworkTransport {
  fetch: typeof fetch;
  dispose(): void;
  disposeAndWait(): Promise<void>;
}

type HostProxyRoute =
  | { kind: "direct"; noProxyMatched?: boolean }
  | { kind: "proxy"; proxyUrl: string }
  | { kind: "invalid"; reason: string };

function bypassProxy(url: URL, noProxy: string | undefined): boolean {
  const hostname = url.hostname.toLowerCase();
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return (noProxy ?? "").split(/[\s,]+/).some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule === "*") return true;
    const [hostPart, rulePort] = rule.replace(/^[a-z][a-z\d+.-]*:\/\//, "").split(":");
    const host = hostPart.replace(/^\*\.?/, "").replace(/^\./, "");
    return (
      Boolean(host) &&
      (hostname === host || hostname.endsWith(`.${host}`)) &&
      (!rulePort || rulePort === port)
    );
  });
}

function normalizeProxy(proxy: string): string | undefined {
  try {
    const url = new URL(/^\w[\w+.-]*:\/\//.test(proxy) ? proxy : `http://${proxy}`);
    if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function resolveHostProxyForUrl(
  requestUrl: string | URL,
  options: HostApiNetworkOptions,
): HostProxyRoute {
  let url: URL;
  try {
    url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  } catch {
    return { kind: "direct" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "direct" };
  if (bypassProxy(url, options.noProxy)) return { kind: "direct", noProxyMatched: true };
  const configuredProxy = options.httpProxy?.trim();
  if (!configuredProxy) return { kind: "direct" };
  const proxyUrl = normalizeProxy(configuredProxy);
  return proxyUrl
    ? { kind: "proxy", proxyUrl }
    : { kind: "invalid", reason: "Configured Host proxy URL is invalid" };
}

async function createDispatcher(
  route: Exclude<HostProxyRoute, { kind: "invalid" }>,
  caCertPath: string | undefined,
): Promise<Dispatcher> {
  const customCa = caCertPath ? await readFile(caCertPath, "utf8") : undefined;
  const ca = customCa ? [...rootCertificates, customCa] : undefined;
  if (route.kind === "proxy") {
    return new ProxyAgent({
      uri: route.proxyUrl,
      proxyTls: ca ? { ca } : undefined,
      requestTls: ca ? { ca } : undefined,
    });
  }
  return new Agent({ connect: ca ? { ca } : undefined });
}

interface HostApiNetworkTransportDependencies {
  createDispatcher?: typeof createDispatcher;
  fetchWithDispatcher?: (
    input: string,
    init: Omit<RequestInit, "dispatcher"> & { dispatcher: Dispatcher },
  ) => Promise<Response>;
}

export function createHostApiNetworkTransport(
  resolveOptions: () => Promise<HostApiNetworkOptions>,
  dependencies: HostApiNetworkTransportDependencies = {},
): HostApiNetworkTransport {
  const dispatcherFactory = dependencies.createDispatcher ?? createDispatcher;
  const fetchWithDispatcher =
    dependencies.fetchWithDispatcher ??
    ((input, init) => undiciFetch(input, init as never) as unknown as Promise<Response>);
  let optionsPromise: Promise<HostApiNetworkOptions> | undefined;
  const dispatchers = new Map<string, Promise<Dispatcher>>();
  let disposed = false;
  let generation = 0;
  let pendingCreations = 0;
  let doneResolver: (() => void) | undefined;
  let donePromise: Promise<void> | undefined;
  const lateDisposePromises: Promise<void>[] = [];
  let disposePromise: Promise<void> | undefined;
  let disposeMode: "close" | "destroy" | undefined;

  const markCreationDone = () => {
    pendingCreations -= 1;
    if (pendingCreations === 0) {
      doneResolver?.();
      doneResolver = undefined;
    }
  };

  const startDispose = (mode: "close" | "destroy"): Promise<void> => {
    if (disposePromise) return disposePromise;
    disposed = true;
    generation += 1;
    disposeMode = mode;
    const snapshot = [...dispatchers.values()];
    dispatchers.clear();
    if (pendingCreations > 0) {
      donePromise = new Promise<void>((resolve) => {
        doneResolver = resolve;
      });
    }
    disposePromise = (async () => {
      await Promise.allSettled(
        snapshot.map(async (creation) => {
          const dispatcher = await creation;
          if (mode === "close") await dispatcher.close();
          else await dispatcher.destroy();
        }),
      );
      await donePromise;
      await Promise.all(lateDisposePromises);
    })();
    return disposePromise;
  };

  const transportFetch: typeof fetch = async (input, init) => {
    if (disposed) throw new Error("Host API network transport has been disposed");
    const requestGeneration = generation;
    if (!optionsPromise) {
      optionsPromise = resolveOptions().catch((error) => {
        optionsPromise = undefined;
        throw error;
      });
    }
    const options = await optionsPromise;
    if (disposed || generation !== requestGeneration) {
      throw new Error("Host API network transport has been disposed");
    }
    const requestUrl = input instanceof Request ? input.url : String(input);
    const route = resolveHostProxyForUrl(requestUrl, options);
    if (route.kind === "invalid") throw new Error(route.reason);
    if (route.kind === "direct" && !options.caCertPath) return globalThis.fetch(input, init);

    const key = `${route.kind}:${route.kind === "proxy" ? route.proxyUrl : "direct"}:${options.caCertPath ?? ""}`;
    let dispatcherPromise = dispatchers.get(key);
    if (!dispatcherPromise) {
      if (disposed) throw new Error("Host API network transport has been disposed");
      const dispatcherGeneration = generation;
      pendingCreations += 1;
      dispatcherPromise = dispatcherFactory(route, options.caCertPath);
      dispatchers.set(key, dispatcherPromise);
      const creation = dispatcherPromise;
      creation
        .then((dispatcher) => {
          if (
            (disposed || generation !== dispatcherGeneration) &&
            dispatchers.get(key) === creation
          ) {
            dispatchers.delete(key);
            const cleanup = Promise.resolve(
              disposeMode === "close" ? dispatcher.close() : dispatcher.destroy(),
            ).catch(() => {});
            lateDisposePromises.push(cleanup);
          }
        })
        .catch(() => {});
      creation.then(markCreationDone, markCreationDone);
      creation.catch(() => {
        if (dispatchers.get(key) === creation) dispatchers.delete(key);
      });
    }
    const dispatcher = await dispatcherPromise;
    if (disposed || generation !== requestGeneration) {
      throw new Error("Host API network transport has been disposed");
    }
    return fetchWithDispatcher(input as string, { ...init, dispatcher });
  };

  return {
    fetch: transportFetch,
    dispose: () => {
      void startDispose("destroy");
    },
    disposeAndWait: () => startDispose("close"),
  };
}
