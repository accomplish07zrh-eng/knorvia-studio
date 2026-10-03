export const MAX_PLUGIN_REFERENCES_PER_TURN = 8;

export interface ExtractPluginReferencesResult {
  references: string[];
  truncatedCount: number;
  invalidCount: number;
}

export function isValidPluginStableId(candidate: string): boolean {
  if (candidate.length < 1 || candidate.length > 256) {
    return false;
  }

  const divider = candidate.indexOf("@");
  if (divider < 1 || divider !== candidate.lastIndexOf("@")) {
    return false;
  }

  const segment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const prefix = candidate.slice(0, divider);
  const suffix = candidate.slice(divider + 1);
  return segment.exec(prefix)?.[0] === prefix && segment.exec(suffix)?.[0] === suffix;
}

export function extractPluginReferences(input: string): ExtractPluginReferencesResult {
  const result: ExtractPluginReferencesResult = {
    references: [],
    truncatedCount: 0,
    invalidCount: 0,
  };
  const retained = new Set<string>();
  const links = /\[(?:\\.|[^\\\]])*\]\((?:<((?:\\.|[^>])*?)>|((?:\\.|[^)\s])*))\)/g;
  links.lastIndex = 0;

  for (const link of input.matchAll(links)) {
    const destination = link[1] ?? link[2] ?? "";
    if (!/^plugin:\/\//i.test(destination)) {
      continue;
    }

    const stableId = destination.slice("plugin://".length);
    if (!destination.startsWith("plugin://") || !isValidPluginStableId(stableId)) {
      result.invalidCount += 1;
      continue;
    }
    if (retained.has(stableId)) {
      continue;
    }
    if (result.references.length >= MAX_PLUGIN_REFERENCES_PER_TURN) {
      result.truncatedCount += 1;
      continue;
    }

    retained.add(stableId);
    result.references.push(stableId);
  }

  return result;
}
