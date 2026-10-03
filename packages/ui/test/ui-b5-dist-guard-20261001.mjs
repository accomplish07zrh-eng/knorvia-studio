import { registerHooks } from "node:module";

// Preload only for the compiled UI gate; reject accidental source-alias fallback.
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (result.url.includes("/packages/ui/src/")) {
      throw new Error(`B5 compiled contract used UI source: ${result.url}`);
    }
    return result;
  },
});
