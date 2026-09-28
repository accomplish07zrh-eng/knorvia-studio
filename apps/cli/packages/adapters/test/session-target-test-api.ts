// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export * as target from "../src/storage/session-target.js";
export { SqliteSessionStore as Store } from "../src/storage/index.js";
import type { setSessionTarget } from "../src/storage/session-target.js";
export type SessionGoal = ReturnType<typeof setSessionTarget>;
