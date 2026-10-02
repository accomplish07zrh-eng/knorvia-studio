import fs from 'node:fs';import ts from '/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root='/workspace/knorvia-studio',t='/tmp/knorvia-expert-queue-20261002/prompt-rendering';const a=JSON.parse(fs.readFileSync(root+'/apps/cli/packages/core/test/workflow-expert-prompt-rendering-baseline.json','utf8')).files.prompts;
if(createHash('sha256').update(a.compiled).digest('hex')!==a.compiledSha256)throw Error('Historical digest mismatch');
const bind=x=>x.replace(/from "([^"]+)"/gu,(_,path)=>`from ${JSON.stringify(pathToFileURL(root+'/apps/cli/packages/core/dist/workflow/expert/'+path).href)}`);
fs.writeFileSync(t+'/baseline.mjs',bind(a.compiled));fs.writeFileSync(t+'/draft.mjs',bind(ts.transpileModule(fs.readFileSync(root+'/docs/evidence/prompt-rendering-author-20261002/prompts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
const old=await import(pathToFileURL(t+'/baseline.mjs')),draft=await import(pathToFileURL(t+'/draft.mjs'));
const input={runId:'owned',task:'Owned task',status:'pending',cwd:'owned',createdAt:'owned-time',updatedAt:'owned-time',phases:[],activities:[],artifacts:[]};
const before=old.buildReport(input),after=draft.buildReport(input);if(before===after)throw Error('Expected empty-section difference missing');
console.log(JSON.stringify({kind:'concrete report artifact bytes: historical emitted vs transpiled original draft',baseline:before,draft:after,baselineBytes:Buffer.byteLength(before),draftBytes:Buffer.byteLength(after)},null,2));
