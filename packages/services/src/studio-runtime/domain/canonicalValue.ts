/** Stable payload receipts are independent of object insertion order. */
export function canonicalStudioValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStudioValue).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStudioValue((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
