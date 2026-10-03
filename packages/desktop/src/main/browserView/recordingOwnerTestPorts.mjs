import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Every I/O and Electron authority is injected. No native session or file is created.
const names = {
  video: "browserVideoRecorder.ts",
  webm: "electronBrowserWebmRecorder.ts",
  bootstrap: "browserTransparentWindowBootstrap.ts",
};
const selected = process.env.KNORVIA_RECORDING_BASELINE;
export function load(owner, ports = {}) {
  const file = selected
    ? path.join(selected, `${owner}.ts`)
    : path.join(import.meta.dirname, names[owner]);
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    transformers: {
      before: [
        (context) => (sf) => {
          const visit = (node) => {
            if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression))
              return ts.factory.createStringLiteral("/synthetic/main");
            return ts.visitEachChild(node, visit, context);
          };
          return ts.visitNode(sf, visit);
        },
      ],
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    {
      exports: module.exports,
      module,
      Buffer,
      Error,
      DOMException,
      ArrayBuffer,
      setTimeout: ports.setTimeout,
      clearTimeout: ports.clearTimeout,
      require(name) {
        if (Object.hasOwn(ports, name)) return ports[name];
        if (name === "node:path") return path;
        throw new Error(`Uninjected port ${name}`);
      },
    },
    { filename: file },
  );
  return module.exports;
}
