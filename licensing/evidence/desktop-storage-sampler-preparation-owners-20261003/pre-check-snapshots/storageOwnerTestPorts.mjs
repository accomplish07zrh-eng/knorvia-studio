import fs from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
import { z } from 'zod';
const files = { disk: 'startupDiskSampler.ts', preparation: 'storagePreparationProcesses.ts' };
export const plain = value => JSON.parse(JSON.stringify(value));
export const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; };
export const drain = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
const codes=['storage_full','permission_denied','io_error','out_of_memory','corrupt','open_failed','lock_timeout','checksum_mismatch','newer_database','backup_failed','sql_failed','startup_status_timeout','transport_closed','unsupported_runtime'];
export function sharedPorts(parseFrame) {
 const migration=z.object({kind:z.enum(['none','initialize','upgrade']),executedCount:z.number().int().nonnegative(),committedCount:z.number().int().nonnegative(),lastAppliedMigrationId:z.string().regex(/^[a-zA-Z_0-9-]{1,128}$/).nullable().optional()}).strict().superRefine((facts,ctx)=>{if(facts.committedCount>facts.executedCount||(facts.kind==='none'&&facts.executedCount!==0))ctx.addIssue({code:'custom',message:'Invalid migration execution facts'});});
 return {databaseStartupErrorCodeSchema:z.enum(codes),databaseMigrationFactsSchema:migration,databaseStartupErrorDetailsSchema:z.object({sqliteCode:z.number().int().optional(),systemCode:z.string().max(64).optional(),migrationId:z.string().max(128).optional()}),knorviaStoragePreparationFrameSchema:{parse:parseFrame}};
}
export function load(owner, ports={}, globals={}) {
 const file=process.env.KNORVIA_STORAGE_BASELINE?`${process.env.KNORVIA_STORAGE_BASELINE}/${owner}.ts`:`packages/desktop/src/host/${files[owner]}`;
 const imports={'node:path':{dirname,resolve},'node:crypto':{createHash},'node:fs/promises':ports.fs??{stat(){throw new Error('unexpected real probe');},statfs(){throw new Error('unexpected real probe');},realpath(){throw new Error('unexpected real path');}},'node:worker_threads':{Worker:ports.Worker},'node:readline':{createInterface:ports.createInterface},zod:{z},'@knorvia/shared':ports.shared,'@knorvia/services/storage-startup':{resolveDefaultKnorviaAgentCommand:ports.command}};
 const {code}=transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'cjs',target:'node24',define:{'import.meta.url':'"file:///synthetic/host/storagePreparationProcesses.js"'},logLevel:'silent'});
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(!(name in imports))throw new Error(`unexpected import ${name}`);return imports[name];},Error,Promise,URL,Date,process:{env:{SYNTHETIC:'base',OVERRIDE:'base'}},...globals},{filename:file});
 return module.exports;
}
export class PortEmitter {
 constructor(){this.handlers=new Map();}
 on(name,handler){const list=this.handlers.get(name)??[];list.push({handler,once:false});this.handlers.set(name,list);return this;}
 once(name,handler){const list=this.handlers.get(name)??[];list.push({handler,once:true});this.handlers.set(name,list);return this;}
 emit(name,...args){for(const item of [...(this.handlers.get(name)??[])]){if(item.once)this.handlers.set(name,(this.handlers.get(name)??[]).filter(entry=>entry!==item));item.handler(...args);}}
}
export function signalPort(aborted=false){const signal={aborted,handler:null,addEventListener(name,handler,options){if(this!==signal||name!=='abort'||options.once!==true)throw new Error('signal binding');this.handler=handler;},removeEventListener(name,handler){if(this!==signal||name!=='abort'||this.handler!==handler)throw new Error('signal cleanup');this.handler=null;},abort(){this.aborted=true;this.handler?.();}};return signal;}
