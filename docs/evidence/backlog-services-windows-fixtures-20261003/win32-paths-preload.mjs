import path from "node:path";
import { mock } from "node:test";

// Inject path semantics for fake-IO cases; this process still runs on Linux.
mock.module("node:path", {
  namedExports: { ...path.win32 },
  defaultExport: path.win32,
});
