// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { EventEmitter } from "node:events";
import { getHttpState } from "./seam-state.mjs";

class OwnedResponse extends EventEmitter {
  #finish;
  constructor(finish) {
    super();
    this.#finish = finish;
    this.body = "";
    this.headers = {};
    this.statusCode = 200;
  }
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }
  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    return this;
  }
  write(chunk = "") {
    this.body += String(chunk);
    return true;
  }
  end(chunk = "") {
    if (chunk !== undefined) this.body += String(chunk);
    const result = { body: this.body, headers: { ...this.headers }, statusCode: this.statusCode };
    this.emit("finish");
    this.#finish(result);
    return this;
  }
}

export class Server extends EventEmitter {
  constructor(handler) {
    super();
    this.handler = handler;
    this.listening = false;
    this.listenCalls = [];
    this.closeCalls = 0;
    this.port = undefined;
  }
  listen(...args) {
    const callback = typeof args.at(-1) === "function" ? args.pop() : undefined;
    let port;
    let host;
    if (typeof args[0] === "object") ({ port, host } = args[0]);
    else [port, host] = args;
    this.listenCalls.push({ host, port });
    const state = getHttpState();
    queueMicrotask(() => {
      if (state.listenError) {
        this.emit("error", state.listenError);
        return;
      }
      this.listening = true;
      this.port = state.nextPort++;
      this.emit("listening");
      callback?.();
    });
    return this;
  }
  address() {
    const configured = getHttpState().addressValue;
    if (configured !== undefined) return configured;
    if (!this.listening) return null;
    return { address: "127.0.0.1", family: "IPv4", port: this.port };
  }
  close(callback) {
    this.closeCalls += 1;
    const state = getHttpState();
    const wasListening = this.listening;
    this.listening = false;
    queueMicrotask(() => {
      if (state.closeError) callback?.(state.closeError);
      else if (!wasListening) {
        const error = new Error("Server is not running");
        error.code = "ERR_SERVER_NOT_RUNNING";
        callback?.(error);
      } else callback?.();
    });
    return this;
  }
  dispatch(url, init = {}) {
    const request = { headers: init.headers ?? {}, method: init.method ?? "GET", url };
    return this.dispatchRaw(request);
  }
  dispatchRaw(request) {
    return new Promise((resolve, reject) => {
      const response = new OwnedResponse(resolve);
      try {
        const result = this.handler(request, response);
        Promise.resolve(result).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }
}

export function createServer(handler) {
  const server = new Server(handler);
  getHttpState().servers.push(server);
  return server;
}

export default { createServer, Server };
