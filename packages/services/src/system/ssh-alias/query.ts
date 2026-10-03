import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

function fromPath(binary: string): string | null {
  const value = process.env["PATH"];
  if (!value) return null;
  for (const raw of value.split(delimiter)) {
    const directory = raw.trim();
    if (!directory) continue;
    const candidate = join(directory, binary);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function findSSH(): string | null {
  if (process.platform !== "win32") return fromPath("ssh");
  const found = fromPath("ssh.exe");
  if (found) return found;
  const windows = process.env["WINDIR"]?.trim() || "C:\\Windows";
  const programs = process.env["ProgramFiles"]?.trim() || "C:\\Program Files";
  const programsX86 = process.env["ProgramFiles(x86)"]?.trim() || "C:\\Program Files (x86)";
  const candidates = [
    join(windows, "System32", "OpenSSH", "ssh.exe"),
    join(programs, "OpenSSH", "ssh.exe"),
    join(programs, "Git", "usr", "bin", "ssh.exe"),
    join(programsX86, "Git", "usr", "bin", "ssh.exe"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function queryAlias(
  executable: string,
  root: string,
  alias: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(executable, ["-G", "-F", root, "-o", "BatchMode=yes", alias], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      env: { ...process.env, SSH_ASKPASS_REQUIRE: "never", SSH_ASKPASS: "", DISPLAY: "" },
    });
    let finished = false;
    let stdout = "";
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      resolve(null);
    }, 1500);
    child.stdout.on("data", (chunk: Buffer | string) => {
      if (finished) return;
      stdout = (stdout + chunk.toString()).slice(0, 128000);
    });
    child.on("error", () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(code === 0 ? stdout : null);
    });
  });
}

export async function mapWorkers<T, R>(
  items: T[],
  requested: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const count = Math.max(1, Math.min(requested, items.length));
  const output: R[] = [];
  output.length = items.length;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: count }, () => worker()));
  return output;
}
