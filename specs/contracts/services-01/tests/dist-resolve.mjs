// SPDX-License-Identifier: Apache-2.0
const distRoot = new URL("../../../../packages/services/dist/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("#src/") && context.parentURL?.includes("/packages/services/dist/")) {
    return {
      url: new URL(specifier.slice("#src/".length), distRoot).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
