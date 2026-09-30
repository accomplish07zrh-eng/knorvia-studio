// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

const HTTP_KEY = Symbol.for("knorvia.auth.tests.http.v1");
const PERSISTENCE_KEY = Symbol.for("knorvia.auth.tests.persistence.v1");

function freshHttpState() {
  return {
    servers: [],
    nextPort: 43100,
    listenError: undefined,
    addressValue: undefined,
    closeError: undefined,
  };
}

function freshPersistenceState() {
  return {
    events: [],
    failNextWrite: undefined,
    failNextBackup: undefined,
  };
}

export function getHttpState() {
  return (globalThis[HTTP_KEY] ??= freshHttpState());
}

export function resetHttpState() {
  globalThis[HTTP_KEY] = freshHttpState();
  return globalThis[HTTP_KEY];
}

export function getPersistenceState() {
  return (globalThis[PERSISTENCE_KEY] ??= freshPersistenceState());
}

export function resetPersistenceState() {
  globalThis[PERSISTENCE_KEY] = freshPersistenceState();
  return globalThis[PERSISTENCE_KEY];
}
