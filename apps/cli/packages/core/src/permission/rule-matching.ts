// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
const REGEXP_META = new Set("\\^$.*+?()[]{}|");
const WILDCARD = "*";
const ANY_RUN = ".*";
const DOMAIN_PREFIX = "domain:";

export function wildcardToRegExp(pattern: string): RegExp {
  const fragments = ["^"];
  for (const character of pattern) {
    fragments.push(
      character === WILDCARD ? ANY_RUN : REGEXP_META.has(character) ? `\\${character}` : character,
    );
  }
  fragments.push("$");
  return new RegExp(fragments.join(""));
}

export function webFetchRuleSubjects(url: string): string[] {
  const parsed = URL.parse(url.trim());
  if (!parsed?.hostname) return [];
  const host = parsed.hostname.toLowerCase();
  const domain = host.endsWith(".") ? host.slice(0, -1) : host;
  return domain ? [DOMAIN_PREFIX + domain] : [];
}
