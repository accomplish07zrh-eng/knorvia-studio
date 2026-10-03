import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js';
const root='/workspace/knorvia-studio', core=root+'/apps/cli/packages/core', dir='/tmp/knorvia-runtime-persistence-20261003/rewind/red-js';
await fs.mkdir(dir,{recursive:true});
const b=JSON.parse(await fs.readFile(core+'/test/runtime-rewind-baseline-20261003.json','utf8'));
function bind(text){return text.replace(/from "([^"]+)"/gu,(_,p)=>`from ${JSON.stringify(p.startsWith('.')?'file://'+core+'/dist/runtime/methods/'+p:p)}`)}
for(const n of ['rewind','rewind-message','rewind-conversation-state','rewind-workspace-cascade']){let text=await fs.readFile(root+'/docs/evidence/runtime-rewind-author-20261003/'+n+'.ts','utf8');let js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;js=bind(js).replaceAll('file://'+core+'/dist/runtime/methods/./rewind-conversation-state.js','./rewind-conversation-state.mjs').replaceAll('file://'+core+'/dist/runtime/methods/./rewind-workspace-cascade.js','./rewind-workspace-cascade.mjs');await fs.writeFile(dir+'/'+n+'.mjs',js)}
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),old={},candidate={};
for(const n of ['rewind','rewind-message']){old[n]=await import(data(bind(b.files[n].compiled)));candidate[n]=process.env.FINAL==='1'?await import('file://'+core+'/dist/runtime/methods/'+n+'.js'):await import('file://'+dir+'/'+n+'.mjs')}
async function trace(o){const trace={traceId:'owned'},seen=[],runtime={createEvent(type,payload,t){assert.equal(t,trace);return{type,payload}},async appendEvent(e,t){seen.push({sameTrace:t===trace})}};await o.rewind.finishUnavailableRewind.call(runtime,{events:[],reason:'no_checkpoint_available',rewindId:'owned',traceContext:trace});return seen}
async function timing(o){const order=[],r={sessionStore:undefined};o['rewind-message'].rewindConversationToMessage.call(r,{events:[],targetMessageId:'owned',traceContext:{traceId:'owned'}}).then(()=>order.push('done'));await Promise.resolve();for(let i=0;i<5;i++){order.push('tick'+i);await Promise.resolve()}return order}
const expected={trace:await trace(old),timing:await timing(old)},actual={trace:await trace(candidate),timing:await timing(candidate)};
console.log(JSON.stringify({mode:process.env.FINAL==='1'?'final-actual-emitted':'sealed-draft-transpile-with-six-type-errors',expected,actual},null,2));assert.deepEqual(actual,expected);
