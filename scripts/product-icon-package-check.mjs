// Validate actual delivered resources, including the PE RT_ICON payloads.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function icoFrames(bytes) {
  assert.equal(bytes.readUInt32LE(0), 65536, "ICO header");
  return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
    const offset = 6 + index * 16;
    const start = bytes.readUInt32LE(offset + 12);
    return bytes.subarray(start, start + bytes.readUInt32LE(offset + 8));
  });
}

export function peIconFrames(bytes) {
  const pe = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString("ascii", pe, pe + 4), "PE\0\0");
  const optional = pe + 24;
  const directories = optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const resourceRva = bytes.readUInt32LE(directories + 16);
  const sections = optional + bytes.readUInt16LE(pe + 20);
  const offsetOf = (rva) => {
    for (let i = 0; i < bytes.readUInt16LE(pe + 6); i++) {
      const section = sections + i * 40;
      const address = bytes.readUInt32LE(section + 12);
      const size = Math.max(bytes.readUInt32LE(section + 8), bytes.readUInt32LE(section + 16));
      if (rva >= address && rva < address + size)
        return bytes.readUInt32LE(section + 20) + rva - address;
    }
    throw new Error("PE resource RVA outside sections");
  };
  const base = offsetOf(resourceRva);
  const frames = [];
  const visit = (directory, depth) => {
    const count = bytes.readUInt16LE(directory + 12) + bytes.readUInt16LE(directory + 14);
    for (let i = 0; i < count; i++) {
      const entry = directory + 16 + i * 8;
      if (depth === 0 && bytes.readUInt32LE(entry) !== 3) continue;
      const target = bytes.readUInt32LE(entry + 4);
      const at = base + (target & 0x7fffffff);
      if (target & 0x80000000) {
        assert.ok(depth < 3, "Bounded PE resource tree");
        visit(at, depth + 1);
      } else {
        const start = offsetOf(bytes.readUInt32LE(at));
        frames.push(bytes.subarray(start, start + bytes.readUInt32LE(at + 4)));
      }
    }
  };
  visit(base, 0);
  return frames;
}

export async function checkPackagedProductIcons(repository, root, executable, windows) {
  const pairs = [
    ["icon.png", "icon.png"],
    ["icon_windows.png", "icon_windows.png"],
    windows ? ["tray_icon.ico", "icon.ico"] : ["icon_512x512.png", "icons/512x512.png"],
  ];
  for (const [packaged, source] of pairs) {
    assert.deepEqual(
      await readFile(join(root, "resources", packaged)),
      await readFile(join(repository, "packages/desktop/build", source)),
      `Packaged product icon differs: ${packaged}`,
    );
  }
  if (windows) {
    const expected = icoFrames(await readFile(join(repository, "packages/desktop/build/icon.ico")));
    const embedded = peIconFrames(await readFile(executable));
    for (const frame of expected)
      assert.ok(
        embedded.some((actual) => actual.equals(frame)),
        "Executable missing selected icon frame",
      );
  }
  return "Packaged product PNG/tray/launcher resources and Windows PE icon frames match X1W master outputs";
}
