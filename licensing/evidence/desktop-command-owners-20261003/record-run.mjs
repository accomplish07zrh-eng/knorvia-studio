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
    KNORVIA_OWNER_BASELINE: process.env.KNORVIA_OWNER_BASELINE,
    KNORVIA_PUBLIC_SHAPE_OUT: process.env.KNORVIA_PUBLIC_SHAPE_OUT,
    KNORVIA_PUBLIC_SHAPE_COMPARE: process.env.KNORVIA_PUBLIC_SHAPE_COMPARE,
  },
  commandFileBindings: bindings,
  stdout: result.stdout,
  stderr: result.stderr,
  exitCode: result.status,
  error: result.error?.message,
};
fs.writeFileSync(
  `licensing/evidence/desktop-command-owners-20261003/${name}.json`,
  JSON.stringify(record, null, 2) + "\n",
  { flag: "wx" },
);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
