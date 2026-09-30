// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
export function mergeModelRequestHeaders(
  ...sources: (Readonly<Record<string, string>> | undefined)[]
): Record<string, string> {
  const merged = new Map<string, { name: string; value: string }>();
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const key = name.toLowerCase();
      merged.delete(key);
      merged.set(key, { name, value });
    }
  }
  return Object.fromEntries([...merged.values()].map(({ name, value }) => [name, value]));
}
