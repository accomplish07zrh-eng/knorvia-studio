// Exercise emitted services and their emitted RPC/shared dependencies without #src fallback.
// This only changes resolution in the explicitly requested test process, never product config.
import { registerHooks } from "node:module";

const servicesDist = new URL("../dist/", import.meta.url).href;
const emittedPackages = {
  "@knorvia/rpc": new URL("../../rpc/dist/index.js", import.meta.url).href,
  "@knorvia/shared": new URL("../../shared/dist/index.js", import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (emittedPackages[specifier]) return nextResolve(emittedPackages[specifier], context);
    if (specifier.startsWith("#src/") && context.parentURL?.startsWith(servicesDist)) {
      return nextResolve(new URL(specifier.slice(5), servicesDist).href, context);
    }
    if (context.parentURL?.startsWith(servicesDist) && specifier.includes("/src/")) {
      throw new Error(`Unexpected source fallback from emitted service: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
