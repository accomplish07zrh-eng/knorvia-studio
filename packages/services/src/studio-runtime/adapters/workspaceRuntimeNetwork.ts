// SPDX-License-Identifier: Apache-2.0
import { createServer } from "node:net";
import { get } from "node:http";
import { execFile } from "node:child_process";
import { readdir, readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";
import type { WorkspaceRuntimeProcessProof } from "../app/workspaceRuntimePort.js";
import { WorkspaceRuntimeFault } from "../domain/workspaceRuntime.js";
import { workspaceRuntimeEnvironment } from "../domain/workspaceRuntimeEnvironment.js";

const runFile = promisify(execFile);
export async function reserveWorkspaceRuntimePort(excluded: readonly number[]) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new WorkspaceRuntimeFault("port-conflict");
    let released = false;
    const release = () =>
      new Promise<void>((resolve, reject) => {
        if (released) {
          resolve();
          return;
        }
        released = true;
        server.close((error) => (error ? reject(error) : resolve()));
      });
    if (excluded.includes(address.port)) {
      await release();
      continue;
    }
    return { port: address.port, release };
  }
  throw new WorkspaceRuntimeFault("port-conflict");
}
export function workspaceRuntimeHttpReady(port: number, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = get(
      { host: "127.0.0.1", port, path, timeout: 750, agent: false },
      (response) => {
        const ready = (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 400;
        response.destroy();
        resolve(ready);
      },
    );
    request.once("error", () => resolve(false));
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}
/** Read-only listener attribution; never kill a process merely because it occupies a port. */
export async function workspaceRuntimeOwnsPort(
  proof: WorkspaceRuntimeProcessProof,
  port: number,
): Promise<boolean> {
  const pids = new Set(proof.identities.map((identity) => identity.pid));
  if (!pids.size) return false;
  try {
    if (process.platform === "linux") {
      const table = await readFile("/proc/net/tcp", "utf8");
      const inodes = new Set(
        table
          .trim()
          .split("\n")
          .slice(1)
          .flatMap((line) => {
            const fields = line.trim().split(/\s+/);
            const endpoint = fields[1]?.split(":");
            return fields[3] === "0A" &&
              endpoint?.[0] === "0100007F" &&
              parseInt(endpoint[1]!, 16) === port
              ? [fields[9]]
              : [];
          }),
      );
      for (const pid of pids) {
        const dir = `/proc/${pid}/fd`;
        const names = await readdir(dir).catch(() => [] as string[]);
        for (const name of names) {
          const link = await readlink(`${dir}/${name}`).catch(() => "");
          const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
          if (inode && inodes.has(inode)) return true;
        }
      }
      return false;
    }
    if (process.platform === "win32") {
      const { stdout } = await runFile("netstat.exe", ["-ano", "-p", "TCP"], {
        timeout: 1500,
        windowsHide: true,
        maxBuffer: 262_144,
        env: workspaceRuntimeEnvironment(process.env, "win32"),
      });
      // 修复：NetTCP 模块发现会挂起；原生输出必须同时匹配协议、端点、监听状态与自有 PID。
      return stdout.split(/\r?\n/).some((line) => {
        const fields = line.trim().split(/\s+/);
        return (
          fields.length === 5 &&
          fields[0] === "TCP" &&
          fields[1] === `127.0.0.1:${port}` &&
          fields[2] === "0.0.0.0:0" &&
          fields[3] === "LISTENING" &&
          /^\d+$/.test(fields[4]!) &&
          pids.has(Number(fields[4]))
        );
      });
    }
    if (process.platform === "darwin") {
      const { stdout } = await runFile(
        "/usr/sbin/lsof",
        ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-FpPn"],
        {
          timeout: 1500,
          maxBuffer: 32_768,
          env: workspaceRuntimeEnvironment(process.env, "posix"),
        },
      );
      let pid = 0;
      for (const line of stdout.split("\n")) {
        if (line.startsWith("p")) pid = Number(line.slice(1));
        if (line === `n127.0.0.1:${port}` && pids.has(pid)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}
