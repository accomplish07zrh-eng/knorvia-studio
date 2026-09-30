// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import {
  getHttpState,
  getPersistenceState,
  resetHttpState,
  resetPersistenceState,
} from "./seam-state.mjs";

export { getHttpState, getPersistenceState, resetHttpState, resetPersistenceState };

export function latestServer() {
  return getHttpState().servers.at(-1);
}

export function failNextWrite(error = new Error("owned atomic write failure")) {
  getPersistenceState().failNextWrite = error;
}

export function failNextBackup(error = new Error("owned backup failure")) {
  getPersistenceState().failNextBackup = error;
}
