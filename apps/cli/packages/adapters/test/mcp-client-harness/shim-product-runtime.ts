// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export const stdioTransportSource = String.raw`
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
const key = Symbol.for("knorvia.mcp.independent.seams");
export class ProcessTreeStdioClientTransport extends StdioClientTransport {
  constructor(parameters, options) {
    super(parameters);
    const seams = globalThis[key];
    this.processExit = seams.getValue("stdio.processExit", undefined);
    this.processAlive = seams.getValue("stdio.processAlive", true);
    seams.invoke("stdio.processTree.construct", this, [parameters, options]);
  }
  terminateWindowsJobObject() {
    return Promise.resolve(globalThis[key].invoke("stdio.terminateJob", this, []));
  }
  start() { return Promise.resolve(); }
  send(message) { return Promise.resolve(globalThis[key].invoke("stdio.send", this, [message])); }
}
`;

export const processTreeSource = String.raw`
const key = Symbol.for("knorvia.mcp.independent.seams");
export function terminateMcpStdioProcessTree(pid, options) {
  return Promise.resolve(globalThis[key].invoke("processTree.terminate", this, [pid, options]));
}
`;

export const emptySource = "export {};";
