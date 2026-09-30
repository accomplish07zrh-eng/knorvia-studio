// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";

export const NETWORK_AUDIT_ENV = "KNORVIA_MODEL_CONTRACT_NETWORK_AUDIT";
export const NETWORK_EVIDENCE_ROOT_ENV = "KNORVIA_MODEL_CONTRACT_EVIDENCE_ROOT";
export const NETWORK_RUN_NAME_ENV = "KNORVIA_MODEL_CONTRACT_RUN_NAME";
export const NETWORK_VIOLATION_EXIT_CODE = 86;

const require = createRequire(import.meta.url);
const http = require("node:http");
const https = require("node:https");
const http2 = require("node:http2");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const dnsPromises = require("node:dns/promises");
const dgram = require("node:dgram");
const guardedFunctions = new WeakSet();
const installedSymbol = Symbol.for("knorvia.model.contract.runtime-network-guard");

const dnsOperations = [
  "lookup",
  "lookupService",
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTlsa",
  "resolveTxt",
  "reverse",
];
const resolverOperations = dnsOperations.filter(
  (operation) => operation !== "lookup" && operation !== "lookupService",
);

export class UnauthorizedNetworkAccessError extends Error {
  constructor(surface, destination) {
    super(`Unauthorized runtime network access: ${surface}`);
    this.code = "ERR_KNORVIA_UNAUTHORIZED_NETWORK";
    this.destination = destination;
    this.name = "UnauthorizedNetworkAccessError";
    this.surface = surface;
  }
}

function canonicalAuditPath(requested, requestedRoot) {
  if (requestedRoot === undefined || !path.isAbsolute(requestedRoot)) {
    throw new Error(`${NETWORK_EVIDENCE_ROOT_ENV} must name one explicit absolute directory`);
  }
  const evidenceRoot = realpathSync(requestedRoot);
  const fallback = path.join(evidenceRoot, "runtime-network-audits", `unbound-${process.pid}.json`);
  const resolved = path.resolve(requested ?? fallback);
  const canonicalParent = realpathSync(path.dirname(resolved));
  const destination = path.join(canonicalParent, path.basename(resolved));
  const relative = path.relative(evidenceRoot, destination);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Runtime network audit must be a file under ${evidenceRoot}`);
  }
  if (path.extname(destination).toLowerCase() !== ".json") {
    throw new Error("Runtime network audit path must end in .json");
  }
  return destination;
}

function ownDataString(value, key) {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return typeof descriptor?.value === "string" || typeof descriptor?.value === "number"
    ? String(descriptor.value)
    : undefined;
}

function urlDestination(value) {
  let raw;
  if (typeof value === "string") raw = value;
  else if (value instanceof URL) raw = value.href;
  else if (typeof Request === "function" && value instanceof Request) raw = value.url;
  if (raw === undefined) return {};
  try {
    const parsed = new URL(raw);
    return {
      ...(parsed.hostname === "" ? {} : { hostname: parsed.hostname }),
      ...(parsed.port === "" ? {} : { port: parsed.port }),
      ...(parsed.protocol === "" ? {} : { protocol: parsed.protocol }),
    };
  } catch {
    return {};
  }
}

function optionsDestination(value, fallbackProtocol) {
  if (typeof value === "string" || value instanceof URL) return urlDestination(value);
  const hostname = ownDataString(value, "hostname") ?? ownDataString(value, "host");
  const port = ownDataString(value, "port");
  const protocol = ownDataString(value, "protocol") ?? fallbackProtocol;
  return {
    ...(hostname === undefined ? {} : { hostname }),
    ...(port === undefined ? {} : { port }),
    ...(protocol === undefined ? {} : { protocol }),
  };
}

function socketDestination(args, protocol) {
  const first = args[0];
  if (typeof first === "object" && first !== null) return optionsDestination(first, protocol);
  const port = typeof first === "number" || typeof first === "string" ? String(first) : undefined;
  const hostname = typeof args[1] === "string" ? args[1] : undefined;
  return {
    ...(hostname === undefined ? {} : { hostname }),
    ...(port === undefined ? {} : { port }),
    protocol,
  };
}

function dnsDestination(args) {
  return typeof args[0] === "string" ? { hostname: args[0], protocol: "dns:" } : {};
}

function marker(payload) {
  process.stderr.write(`KNORVIA_MODEL_CONTRACT_NETWORK_GUARD ${JSON.stringify(payload)}\n`);
}

function replaceValue(target, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined || typeof descriptor.value !== "function") {
    throw new Error(`Cannot guard missing runtime network function: ${String(key)}`);
  }
  Object.defineProperty(target, key, {
    ...descriptor,
    configurable: false,
    value,
    writable: false,
  });
}

function eventDestination(kind, args) {
  switch (kind) {
    case "url":
      return urlDestination(args[0]);
    case "http":
      return optionsDestination(args[0], "http:");
    case "https":
      return optionsDestination(args[0], "https:");
    case "socket":
      return socketDestination(args, "tcp:");
    case "tls":
      return socketDestination(args, "tls:");
    case "dns":
      return dnsDestination(args);
    case "udp":
      return socketDestination(args, "udp:");
    default:
      return {};
  }
}

export function installRuntimeNetworkGuard(options = {}) {
  if (Reflect.get(globalThis, installedSymbol) !== undefined) {
    throw new Error("Runtime network guard is already installed in this process");
  }

  const auditPath = canonicalAuditPath(
    options.auditPath ?? process.env[NETWORK_AUDIT_ENV],
    options.evidenceRoot ?? process.env[NETWORK_EVIDENCE_ROOT_ENV],
  );
  const runName = options.runName ?? process.env[NETWORK_RUN_NAME_ENV] ?? "unbound";
  const state = {
    auditPath,
    events: [],
    installComplete: false,
    installedSurfaces: [],
    runName,
    startedAtUtc: new Date().toISOString(),
  };
  Reflect.set(globalThis, installedSymbol, state);

  const snapshot = (terminal, exitCode) => ({
    schemaVersion: 1,
    runName: state.runName,
    auditPath: state.auditPath,
    startedAtUtc: state.startedAtUtc,
    updatedAtUtc: new Date().toISOString(),
    installComplete: state.installComplete,
    installedSurfaceCount: state.installedSurfaces.length,
    installedSurfaces: [...state.installedSurfaces],
    eventCount: state.events.length,
    violation: state.events.length > 0,
    terminal,
    exitCode,
    events: state.events.map((event) => ({ ...event, destination: { ...event.destination } })),
  });

  const persist = (terminal, exitCode) => {
    const content = `${JSON.stringify(snapshot(terminal, exitCode), undefined, 2)}\n`;
    mkdirSync(path.dirname(state.auditPath), { recursive: true });
    const temporary = `${state.auditPath}.${process.pid}.tmp`;
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, state.auditPath);
  };

  process.once("beforeExit", () => {
    if (state.events.length > 0 && (process.exitCode === undefined || process.exitCode === 0)) {
      process.exitCode = NETWORK_VIOLATION_EXIT_CODE;
    }
    persist(false, process.exitCode ?? 0);
  });
  process.once("exit", (exitCode) => {
    const effectiveExitCode =
      state.events.length > 0 && exitCode === 0 ? NETWORK_VIOLATION_EXIT_CODE : exitCode;
    persist(true, effectiveExitCode);
    marker({
      eventCount: state.events.length,
      exitCode: effectiveExitCode,
      installComplete: state.installComplete,
      runName: state.runName,
      terminal: true,
    });
  });
  persist(false, process.exitCode ?? 0);

  const block = (surface, destinationKind, promiseShaped = false) => {
    const reject = (args) => {
      const destination = eventDestination(destinationKind, args);
      const event = {
        destination,
        sequence: state.events.length + 1,
        surface,
      };
      state.events.push(event);
      if (process.exitCode === undefined || process.exitCode === 0) {
        process.exitCode = NETWORK_VIOLATION_EXIT_CODE;
      }
      persist(false, process.exitCode);
      marker({ destination, sequence: event.sequence, surface, terminal: false });
      return new UnauthorizedNetworkAccessError(surface, destination);
    };
    const blocked = promiseShaped
      ? function (...args) {
          return Promise.reject(reject(args));
        }
      : function (...args) {
          throw reject(args);
        };
    Object.defineProperty(blocked, "name", { value: `blocked_${surface.replaceAll(".", "_")}` });
    guardedFunctions.add(blocked);
    state.installedSurfaces.push(surface);
    return blocked;
  };

  Object.defineProperty(globalThis, "fetch", {
    configurable: false,
    enumerable: true,
    value: block("global.fetch", "url", true),
    writable: false,
  });
  if (typeof globalThis.WebSocket === "function") {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: false,
      enumerable: false,
      value: block("global.WebSocket", "url"),
      writable: false,
    });
  }

  replaceValue(http, "request", block("node:http.request", "http"));
  replaceValue(http, "get", block("node:http.get", "http"));
  replaceValue(http, "ClientRequest", block("node:http.ClientRequest", "http"));
  replaceValue(
    http.Agent.prototype,
    "createConnection",
    block("node:http.Agent.createConnection", "socket"),
  );
  replaceValue(https, "request", block("node:https.request", "https"));
  replaceValue(https, "get", block("node:https.get", "https"));
  replaceValue(
    https.Agent.prototype,
    "createConnection",
    block("node:https.Agent.createConnection", "tls"),
  );
  replaceValue(http2, "connect", block("node:http2.connect", "url"));
  replaceValue(net, "connect", block("node:net.connect", "socket"));
  replaceValue(net, "createConnection", block("node:net.createConnection", "socket"));
  replaceValue(net.Socket.prototype, "connect", block("node:net.Socket.connect", "socket"));
  replaceValue(tls, "connect", block("node:tls.connect", "tls"));

  for (const operation of dnsOperations) {
    replaceValue(dns, operation, block(`node:dns.${operation}`, "dns"));
    replaceValue(dnsPromises, operation, block(`node:dns/promises.${operation}`, "dns", true));
  }
  for (const operation of resolverOperations) {
    replaceValue(dns.Resolver.prototype, operation, block(`node:dns.Resolver.${operation}`, "dns"));
    replaceValue(
      dnsPromises.Resolver.prototype,
      operation,
      block(`node:dns/promises.Resolver.${operation}`, "dns", true),
    );
  }

  replaceValue(dgram, "createSocket", block("node:dgram.createSocket", "udp"));
  for (const operation of ["bind", "connect", "send", "sendto"]) {
    replaceValue(dgram.Socket.prototype, operation, block(`node:dgram.Socket.${operation}`, "udp"));
  }

  syncBuiltinESMExports();
  state.installComplete = true;
  persist(false, process.exitCode ?? 0);
  marker({
    auditPath: state.auditPath,
    eventCount: 0,
    installComplete: true,
    installedSurfaceCount: state.installedSurfaces.length,
    runName: state.runName,
    terminal: false,
  });

  return Object.freeze({
    auditPath,
    getSnapshot: () => snapshot(false, process.exitCode ?? 0),
  });
}

export function isRuntimeNetworkGuardFunction(value) {
  return typeof value === "function" && guardedFunctions.has(value);
}
