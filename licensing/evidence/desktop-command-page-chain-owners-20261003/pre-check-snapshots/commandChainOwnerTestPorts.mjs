import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const filenames = { navigation: 'browserCommandState.ts', retry: 'browserScreenshotTransientRetry.ts', scripts: 'browserCommandScripts.ts', paste: 'browserVirtualClipboardPageScript.ts' };
export function owner(name, ports = {}) {
  const file = process.env.KNORVIA_CHAIN_BASELINE ? `${process.env.KNORVIA_CHAIN_BASELINE}/${name}.ts` : `packages/desktop/src/main/browserView/${filenames[name]}`;
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Error, DOMException, URL, Promise, Date, ...ports }, { filename: file });
  return exports;
}
export function page(source, ports = {}) {
  return vm.runInNewContext(source, { Error, ...ports });
}
export function plain(value) { return JSON.parse(JSON.stringify(value)); }
