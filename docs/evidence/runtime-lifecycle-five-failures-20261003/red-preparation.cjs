const fs=require('node:fs'),ts=require('/workspace/knorvia-studio/node_modules/typescript');
for(const n of ['hooks','session-title']){
const f='/tmp/knorvia-runtime-lifecycle-five-20261003/'+n+'/'+n+'.ts';
fs.writeFileSync('/tmp/knorvia-runtime-lifecycle-five-20261003/'+n+'-draft.js',ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText)
}
