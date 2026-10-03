// Test-only strict emitted paths; no product resolver or package changes.
import { registerHooks } from "node:module";
const services = new URL("../dist/", import.meta.url).href;
const ui = new URL("../../ui/dist/", import.meta.url).href;
const packages = {
  "@knorvia/shared": new URL("../../shared/dist/index.js", import.meta.url).href,
  "@knorvia/rpc": new URL("../../rpc/dist/index.js", import.meta.url).href,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (packages[specifier]) return nextResolve(packages[specifier], context);
    if (context.parentURL?.startsWith(services) || context.parentURL?.startsWith(ui)) {
      if (specifier.includes("/src/"))
        throw new Error(`Git emitted consumer source fallback: ${specifier}`);
      if (specifier.startsWith("#src/"))
        return nextResolve(new URL(specifier.slice(5), services).href, context);
      if (specifier.startsWith("@/"))
        return nextResolve(new URL(specifier.slice(2), ui).href, context);
    }
    return nextResolve(specifier, context);
  },
});
