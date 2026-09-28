// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { Fixture } from "./session-target.fixture.js";
import { seedTarget } from "./session-target.fixture.js";
import { target } from "./session-target-test-api.js";

export const writes = [
  "set",
  "clone",
  "create",
  "status",
  "start",
  "heartbeat",
  "finish",
  "recover",
  "account",
  "title",
  "clear",
] as const;
export type WriteKind = (typeof writes)[number];
export function operation(f: Fixture, kind: WriteKind) {
  const { db, sessionID } = f;
  const source =
    kind === "create"
      ? undefined
      : seedTarget(f, {
          activeInputId: "input",
          activeRunStartedAtMs: 1000,
          activeRunLastSeenAtMs: 3000,
        });
  const owned = { sessionID, targetID: "goal", inputID: "input" };
  return () => {
    switch (kind) {
      case "set":
        return target.setSessionTarget(db, {
          sessionID,
          objective: "Replacement",
          status: "paused",
        });
      case "clone":
        return target.cloneSessionTargetForFork(db, {
          sessionID,
          source: { ...source!, targetID: "fork-goal", objective: "Forked" },
          status: "paused",
        });
      case "create":
        return target.createSessionTarget(db, { sessionID, objective: "New" });
      case "status":
        return target.updateSessionTargetStatus(db, { sessionID, status: "paused" });
      case "start":
        return target.startSessionTargetRun(db, {
          ...owned,
          inputID: "new-input",
          startedAtMs: 5000,
        });
      case "heartbeat":
        return target.heartbeatSessionTargetRun(db, { ...owned, seenAtMs: 5000 });
      case "finish":
        return target.finishSessionTargetRun(db, { ...owned, endedAtMs: 6000, tokensUsedDelta: 3 });
      case "recover":
        return target.recoverInterruptedSessionTargetRun(db, { sessionID });
      case "account":
        return target.accountSessionTargetUsage(db, {
          ...owned,
          tokensUsedDelta: 3,
          timeUsedSecondsDelta: 4,
        });
      case "title":
        return target.updateSessionTargetSummaryTitle(db, { ...owned, summaryTitle: "New title" });
      case "clear":
        return target.clearSessionTarget(db, { sessionID });
    }
  };
}
