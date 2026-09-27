// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { isIP } from "node:net";
import type { BrowserInfo } from "./facade.js";

type Priority = readonly number[];

/** Retain input identity and order; larger priority components win. */
function winner<T>(
  entries: readonly T[],
  priority: (entry: T, index: number) => Priority,
): T | undefined {
  let chosen: T | undefined;
  let best: Priority = [];
  entries.forEach((entry, index) => {
    const candidate = priority(entry, index);
    const difference = candidate.findIndex((value, offset) => value !== best[offset]);
    if (chosen === undefined || (difference >= 0 && candidate[difference]! > best[difference]!)) {
      chosen = entry;
      best = candidate;
    }
  });
  return chosen;
}

function backendPreference(info: BrowserInfo): number {
  switch (info.type) {
    case "iab":
      return 3;
    case "extension": {
      const metadata = info.metadata ?? {};
      const preferred =
        ["preferred", "preferredInstance", "profileIsLastUsed"].some(
          (key) => metadata[key] === "true",
        ) || metadata.profileOrdering === "0";
      return preferred ? 2 : 1;
    }
    default:
      return 0;
  }
}

function address(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed;
  } catch {
    return undefined;
  }
}

function targetAddress(value: string): URL {
  const parsed = address(value);
  if (!parsed) throw new Error(`Invalid browser target URL: ${value}`);
  return parsed;
}

function isParentDomain(parent: string, child: string): boolean {
  return parent.includes(".") && isIP(parent) === 0 && child.endsWith(`.${parent}`);
}

function affinity(target: URL, candidateValue: string): number {
  const candidate = address(candidateValue);
  if (!candidate) return 0;
  if (candidate.href === target.href) return 4;
  if (candidate.origin === target.origin && candidate.pathname === target.pathname) return 3;
  if (candidate.hostname === target.hostname) return 2;
  return isParentDomain(target.hostname, candidate.hostname) ||
    isParentDomain(candidate.hostname, target.hostname)
    ? 1
    : 0;
}

function prefersInternal(target: URL): boolean {
  return (
    target.protocol === "file:" ||
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(target.hostname) ||
    target.hostname.endsWith(".localhost")
  );
}

export function selectDefaultBrowser(infos: readonly BrowserInfo[]): BrowserInfo | undefined {
  return winner(infos, (info) => [backendPreference(info)]);
}

export function selectBrowserForUrl(
  infos: readonly BrowserInfo[],
  targetValue: string,
  tabsByBrowserId: ReadonlyMap<string, readonly string[]>,
): BrowserInfo {
  const first = infos[0];
  if (!first) throw new Error("No browser backend is available");
  if (infos.length === 1) return first;
  const target = targetAddress(targetValue);
  const internal = prefersInternal(target) ? infos.find((info) => info.type === "iab") : undefined;
  if (internal) return internal;
  return winner(infos, (info) => {
    const match = (tabsByBrowserId.get(info.id) ?? []).reduce(
      (best, url) => Math.max(best, affinity(target, url)),
      0,
    );
    return [match, backendPreference(info)];
  })!;
}

export function selectTabForUrl<T extends { url?: string; active?: boolean }>(
  targetValue: string,
  tabs: readonly T[],
): T | undefined {
  const target = targetAddress(targetValue);
  const candidates = tabs.map((tab, index) => ({
    tab,
    index,
    match: tab.url ? affinity(target, tab.url) : 0,
  }));
  // 父子域可能属于不同页面主体；复用必须至少同 hostname，避免导航错标签页。
  const reusable = candidates.filter((candidate) => candidate.match >= 2);
  return winner(reusable, (candidate) => [
    candidate.match,
    candidate.tab.active ? 1 : 0,
    candidate.index,
  ])?.tab;
}
