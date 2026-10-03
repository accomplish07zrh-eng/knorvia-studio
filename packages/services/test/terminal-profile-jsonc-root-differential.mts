// Manual synthetic comparison; legacy source stays outside the repository.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const oldPath = process.argv[2];
if (!oldPath) throw new Error("Pass an exact-baseline temporary parseJsonc module path");
const { parseJsonc } = await import(pathToFileURL(oldPath).href);
const target = process.env.KNORVIA_TERMINAL_PROFILE_TARGET === "dist" ? "dist" : "src";
const { interpretTerminalProfile } = await import(
  new URL(`../${target}/terminal/terminalProfilePortableFormats.js`, import.meta.url).href
);
let state = 22318,
  cases = 0;
const bits = [
  "",
  " ",
  "\n",
  "\t",
  "//a\n",
  "/*b*/",
  ",",
  "{",
  "}",
  "]",
  "[",
  '"',
  "\\",
  "0",
  "null",
  "/*",
  "//",
  "/",
];
function next(n: number) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state % n;
}
function check(raw: string) {
  const v = parseJsonc(raw)?.["terminal.integrated.fontFamily"];
  const expected = typeof v === "string" && v.trim() ? { fontFamily: v.trim() } : null;
  assert.deepEqual(interpretTerminalProfile("vscode-jsonc", raw), expected, JSON.stringify(raw));
  cases++;
}
for (let i = 0; i < 30000; i++) {
  let tail = "";
  for (let k = next(12); k--; ) {
    tail += bits[next(bits.length)];
  }
  check('{"terminal.integrated.fontFamily":"Owned Font"' + tail + "}");
  check(
    bits[next(bits.length)] +
      "{" +
      bits[next(bits.length)] +
      '"terminal.integrated.fontFamily"' +
      bits[next(bits.length)] +
      ':"Owned Font",' +
      tail +
      "}",
  );
}
console.log(JSON.stringify({ seed: 22318, cases, mismatches: 0 }));
