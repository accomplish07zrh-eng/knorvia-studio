import type { WebSearchResultItem, WebSearchSource } from "@knorvia/contracts";

type Node = Record<string, unknown>;
type Leaf<T> = (node: Node) => T | undefined;
export const nonemptyText = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const resultLeaf: Leaf<WebSearchResultItem> = (node) => {
  const url = nonemptyText(node.url);
  const type = nonemptyText(node.type);
  return url && (!type || type === "web_search_result" || type === "url")
    ? { url, title: nonemptyText(node.title), pageAge: nonemptyText(node.pageAge) }
    : undefined;
};
const sourceLeaf: Leaf<WebSearchSource> = (node) => {
  const url = nonemptyText(node.url);
  return url ? { url, title: nonemptyText(node.title) } : undefined;
};

// One ordered forest traversal applies a different leaf policy for each projection.
// Array methods keep inherited/sparse slots and receiver semantics at this raw boundary.
function visit<T>(value: unknown, leaf: Leaf<T>): T[] {
  if (Array.isArray(value)) return value.flatMap((child) => visit(child, leaf));
  if (typeof value !== "object" || value === null) return [];
  const node = value as Node;
  const selected = leaf(node);
  if (selected) return [selected];
  for (const branch of ["content", "sources"] as const) {
    if (Array.isArray(node[branch]))
      return (node[branch] as unknown[]).flatMap((child) => visit(child, leaf));
  }
  return [];
}

export const resultItems = (value: unknown): WebSearchResultItem[] => visit(value, resultLeaf);
export const sourceItems = (value: unknown): WebSearchSource[] => visit(value, sourceLeaf);

export function firstUrls<T extends { url: string }>(items: T[]): T[] {
  const winners = new Map<string, true>();
  return items.filter((item) => {
    const token = item.url.toLowerCase();
    const duplicate = winners.has(token);
    if (!duplicate) winners.set(token, true);
    return !duplicate;
  });
}
