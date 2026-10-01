// Test-process resolution only: exercise emitted feedback helpers and the desktop caller.
import { registerHooks } from "node:module";

const servicesDist = new URL("../dist/", import.meta.url).href;
const emitted = {
  "@knorvia/services/node": new URL("../dist/node.js", import.meta.url).href,
  "@knorvia/shared": new URL("../../shared/dist/index.js", import.meta.url).href,
  "@knorvia/shared/node": new URL("../../shared/dist/node.js", import.meta.url).href,
  "@knorvia/rpc": new URL("../../rpc/dist/index.js", import.meta.url).href,
  // The standalone artifact lives in /tmp, outside workspace package lookup ancestry.
  yazl: import.meta.resolve("yazl"),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (emitted[specifier]) return nextResolve(emitted[specifier], context);
    if (specifier.startsWith("#src/") && context.parentURL?.startsWith(servicesDist)) {
      return nextResolve(new URL(specifier.slice(5), servicesDist).href, context);
    }
    if (context.parentURL?.startsWith(servicesDist) && specifier.includes("/src/")) {
      throw new Error(`Source fallback from emitted services: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
