/** Windows path spellings share the same project operation gate. */
export function studioProjectKey(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")
    ? trimmed.replaceAll("/", "\\").toLowerCase()
    : trimmed;
}
