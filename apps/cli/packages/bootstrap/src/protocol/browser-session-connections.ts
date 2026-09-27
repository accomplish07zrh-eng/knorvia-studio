// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export interface BrowserConnectionIdentity {
  readonly browserId: string;
  readonly browserGeneration: number;
}

export class BrowserSessionConnections {
  readonly #sessions = new Map<string, Map<string, Set<number>>>();

  remember({
    sessionId,
    browserId,
    browserGeneration,
  }: BrowserConnectionIdentity & { sessionId: string }): void {
    let browsers = this.#sessions.get(sessionId);
    if (!browsers) {
      browsers = new Map();
      this.#sessions.set(sessionId, browsers);
    }
    let generations = browsers.get(browserId);
    if (!generations) {
      generations = new Set();
      browsers.set(browserId, generations);
    }
    generations.add(browserGeneration);
  }

  snapshot(sessionId: string): BrowserConnectionIdentity[] {
    const result: BrowserConnectionIdentity[] = [];
    for (const [browserId, generations] of this.#sessions.get(sessionId) ?? []) {
      for (const browserGeneration of generations) result.push({ browserId, browserGeneration });
    }
    return result;
  }

  take(sessionId: string): BrowserConnectionIdentity[] {
    const result = this.snapshot(sessionId);
    this.#sessions.delete(sessionId);
    return result;
  }
}
