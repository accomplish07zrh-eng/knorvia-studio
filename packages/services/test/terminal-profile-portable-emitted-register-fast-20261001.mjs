// Strict emitted resolution for this test process only; production configuration is untouched.
import { registerHooks } from "node:module";
const servicesDist = new URL("../dist/", import.meta.url).href;
const entries = {
  "@knorvia/shared": new URL("../../shared/dist/index.js", import.meta.url).href,
  "@knorvia/rpc": new URL("../../rpc/dist/index.js", import.meta.url).href,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (entries[specifier]) return nextResolve(entries[specifier], context);
    if (context.parentURL?.startsWith(servicesDist)) {
      if (specifier.startsWith("#src/"))
        return nextResolve(new URL(specifier.slice(5), servicesDist).href, context);
      if (specifier.includes("/src/"))
        throw new Error(`Emitted terminal consumer used source fallback: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
