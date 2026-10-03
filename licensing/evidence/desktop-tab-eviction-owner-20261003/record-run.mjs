import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const [name, ...command] = process.argv.slice(2);
const result = spawnSync(command[0], command.slice(1), { encoding: "utf8", env: process.env });
const bindings = command
  .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
  .map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  }));
const record = {
  command,
  selectedEnv: {
    KNORVIA_EVICTION_BASELINE: process.env.KNORVIA_EVICTION_BASELINE,
  },
  commandFileBindings: bindings,
  stdout: result.stdout,
  stderr: result.stderr,
  exitCode: result.status,
  error: result.error?.message,
};
fs.writeFileSync(
  `licensing/evidence/desktop-tab-eviction-owner-20261003/${name}.json`,
  JSON.stringify(record, null, 2) + "\n",
  { flag: "wx" },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
