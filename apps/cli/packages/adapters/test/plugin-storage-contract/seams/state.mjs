// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

const WORLD_KEY = Symbol.for("knorvia.pluginStorage.testWorld");

export function getWorld() {
  const value = globalThis[WORLD_KEY];
  if (!value || typeof value !== "object") {
    throw new Error("Knorvia test world is not initialized");
  }
  return value;
}

export function setWorld(value) {
  globalThis[WORLD_KEY] = value;
  return value;
}

export function record(kind, details = {}) {
  const world = getWorld();
  const entry = {
    index: world.events.length,
    kind,
    ...normalize(details),
  };
  world.events.push(entry);
  return entry;
}

export function normalize(value) {
  if (value === undefined) {
    return "<undefined>";
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (value instanceof Uint8Array) {
    return { bytes: value.byteLength };
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
    };
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== "function")
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function takeScript(queueName) {
  const world = getWorld();
  const queue = world.scripts?.[queueName];
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error(`No scripted ${queueName} result remains`);
  }
  return queue.shift();
}

export function makeError(spec, fallbackMessage) {
  const error = new Error(spec?.message ?? fallbackMessage);
  if (spec?.name) error.name = spec.name;
  if (spec?.code) error.code = spec.code;
  if (spec?.status !== undefined) error.status = spec.status;
  return error;
}
