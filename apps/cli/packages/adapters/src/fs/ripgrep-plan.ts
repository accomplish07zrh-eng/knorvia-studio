import { basename, dirname } from "node:path";
import type { FileSystemSearchTextRequest } from "@knorvia/contracts";
import { fileType, TYPE_EXTENSIONS, VCS_NAMES } from "./file-search-paths.js";

const PREFIX = [
  "--no-config",
  "--hidden",
  "--color",
  "never",
  "--no-heading",
  "--with-filename",
  "--max-columns",
  "500",
];
export function searchPlan(request: FileSystemSearchTextRequest, directory: boolean) {
  const root = directory ? request.path : dirname(request.path),
    args = [...PREFIX];
  for (const name of VCS_NAMES) args.push("--glob", "!" + name, "--glob", `!**/${name}/**`);
  if (request.multiline) args.push("-U", "--multiline-dotall");
  if (request.ignoreCase) args.push("-i");
  if (request.outputMode === "content") {
    args.push("--json");
    if (request.onlyMatching) args.push("--only-matching");
    if (request.context !== undefined) args.push("-C", String(request.context));
    else {
      if (request.beforeContext !== undefined) args.push("-B", String(request.beforeContext));
      if (request.afterContext !== undefined) args.push("-A", String(request.afterContext));
    }
  } else args.push("-c");
  if (request.glob) {
    for (const part of request.glob.split(/\s+/)) {
      const pieces = part.includes("{") && part.includes("}") ? [part] : part.split(",");
      for (const piece of pieces) if (piece.trim()) args.push("--glob", piece.trim());
    }
  }
  if (request.type) {
    const type = fileType(request.type);
    if (/^[a-z0-9_+-]+$/i.test(type))
      for (const extension of TYPE_EXTENSIONS[type] ?? ["." + type])
        args.push("--glob", "*" + extension, "--glob", "**/*" + extension);
  }
  args.push("-e", request.pattern.trim(), "--", directory ? "." : basename(request.path));
  return { args, preopens: { ".": root }, root };
}
