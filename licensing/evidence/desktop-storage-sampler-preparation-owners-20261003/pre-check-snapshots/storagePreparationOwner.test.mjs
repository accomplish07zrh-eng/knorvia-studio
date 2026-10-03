import assert from 'node:assert/strict';
import test from 'node:test';
import { load, plain, defer, drain, PortEmitter, signalPort, sharedPorts } from './storageOwnerTestPorts.mjs';

function fixture(){
 const workers=[],lines=[],timers=[],cleared=[],calls=[];let pathPromise=Promise.resolve('/synthetic/canonical');
 class Worker extends PortEmitter {
  constructor(entry,options){super();this.entry=entry;this.options=options;this.terminations=0;this.stdin=new PortEmitter();this.stdin.write=value=>{calls.push(['write',value]);return false;};this.stdin.end=()=>calls.push('end');this.stdout={synthetic:true};this.stderr={resume:()=>calls.push('drain')};workers.push(this);}
  terminate(){this.terminations++;return Promise.resolve(0);}
 }
 const parseError=new Error('imported parser identity');
 const ports={Worker,createInterface(options){assert.equal(options.input,workers.at(-1).stdout);const emitter=new PortEmitter();emitter.close=()=>calls.push('close');lines.push(emitter);return emitter;},command(params){calls.push(['command',plain(params)]);return {supportsStorageStartup:true,storagePreparationEntry:'/synthetic/entry',cwd:'/synthetic/command-cwd',env:{OVERRIDE:'command'}};},fs:{realpath(path){calls.push(['realpath',path]);return pathPromise;}},shared:sharedPorts(frame=>{if(frame.method==='synthetic/bad')throw parseError;return frame;})};
 const api=load('preparation',ports,{setTimeout(callback,delay){timers.push({callback,delay});return timers.length;},clearTimeout(token){cleared.push(token);}});
 return {api,workers,lines,timers,cleared,calls,ports,parseError,setPath(promise){pathPromise=promise;}};
}

test('storage preparation fake Worker control authority, canonical reuse and exit lifetime',async()=>{
 const host=fixture(),signal=signalPort(),progress=[];
 const prepared=host.api.prepareHostStorage('/synthetic/tasks.db',(phase,migration)=>progress.push([phase,migration]),signal);
 const worker=host.workers[0];assert.equal(worker.entry.href,'file:///synthetic/host/tasksStorageWorker.js');assert.deepEqual(plain(worker.options),{workerData:{path:'/synthetic/tasks.db'}});assert.equal(host.timers[0].delay,30000);
 const facts={kind:'upgrade',executedCount:1,committedCount:1};worker.emit('message',{type:'progress',phase:'checking',migration:facts});assert.equal(progress[0][0],'checking');
 worker.emit('message',{type:'done'});let settled=false;prepared.then(()=>{settled=true;});await drain();assert.equal(settled,false);worker.emit('exit',0);await prepared;assert.equal(signal.handler,null);
 const invalid=host.api.prepareHostStorage('/synthetic/invalid',()=>{},signalPort());const iw=host.workers.at(-1);iw.emit('message',{type:'done',extra:true});assert.equal(iw.terminations,1);iw.emit('exit',0);await assert.rejects(invalid,error=>error.kind==='transport_closed');
 const overwrite=host.api.prepareHostStorage('/synthetic/timeout',()=>{},signalPort());const ow=host.workers.at(-1);ow.emit('error',new Error('initial error'));host.timers.at(-1).callback();ow.emit('exit',1);await assert.rejects(overwrite,error=>error.kind==='startup_status_timeout');
 const reportError=new Error('report identity');const reportFailure=host.api.prepareHostStorage('/synthetic/report',()=>{throw reportError;},signalPort());const rw=host.workers.at(-1);assert.throws(()=>rw.emit('message',{type:'progress',phase:'ready'}),error=>error===reportError);rw.emit('message',{type:'done'});rw.emit('exit',0);await reportFailure;
 const aborted=host.api.prepareHostStorage('/synthetic/aborted',()=>{},signalPort(true));const aw=host.workers.at(-1);assert.equal(aw.terminations,1);aw.emit('exit',0);await assert.rejects(aborted,error=>error.kind==='transport_closed');

 const f=fixture(),sessionSignal=signalPort(),pendingPath=defer(),observed=defer(),cache=new Set(),reports=[];
 f.setPath(pendingPath.promise);
 const options={cwd:'/synthetic/workspace',env:{OVERRIDE:'options',EXTRA:'synthetic'},signal:sessionSignal,preparedPaths:cache,observePath(path){assert.equal(this,options);f.calls.push(['observe',path]);return observed.promise;},report(phase,details){assert.equal(this,options);reports.push([phase,details]);}};
 const session=f.api.prepareSessionStorage(options),sw=f.workers[0],sl=f.lines[0];
 assert.equal(sw.entry,'/synthetic/entry');assert.deepEqual(plain(sw.options.argv),['app-server','--stdio','--prepare-storage','--cwd','/synthetic/command-cwd']);assert.deepEqual(plain(sw.options.env),{SYNTHETIC:'base',OVERRIDE:'command',EXTRA:'synthetic'});assert.deepEqual(f.calls[0],['command',{workspacePath:'/synthetic/workspace',workspaceKey:'/synthetic/workspace',presentationSurface:'desktop'}]);assert.ok(f.calls.includes('drain'));
 sl.emit('line',JSON.stringify({method:'startup/storagePath',params:{path:'/synthetic/reported'}}));assert.equal(f.calls.some(call=>call[0]==='write'),false);pendingPath.resolve('/synthetic/canonical');await drain();assert.ok(f.calls.some(call=>call[0]==='observe'&&call[1]==='/synthetic/reported'));
 const finalCache=new Set();options.preparedPaths=finalCache;observed.resolve();await drain();assert.deepEqual(f.calls.find(call=>call[0]==='write'),['write','{"method":"startup/storagePathReady","reuse":false}\n']);
 sl.emit('line',JSON.stringify({method:'startup/storageState',params:{phase:'ready',databaseId:'synthetic-db'}}));assert.equal(reports[0][0],'ready');assert.deepEqual(Object.keys(reports[0][1]),['databaseId','migration']);
 sl.emit('line',JSON.stringify({method:'startup/storagePrepared',params:{}}));assert.ok(f.calls.includes('end'));sw.emit('exit',0);await session;assert.ok(finalCache.has('/synthetic/canonical'));assert.equal(cache.size,0);assert.equal(sessionSignal.handler,null);assert.equal(f.calls.at(-1),'close');
 const reused=fixture(),reuseSignal=signalPort(),reuseSet=new Set(['/synthetic/canonical']);const reuse=reused.api.prepareSessionStorage({cwd:'/synthetic/reuse',signal:reuseSignal,preparedPaths:reuseSet,observePath(){assert.fail('reuse must skip observe');},report(){}});reused.lines[0].emit('line',JSON.stringify({method:'startup/storagePath',params:{path:'/synthetic/alias'}}));await drain();assert.ok(reused.calls.some(call=>call[1]==='{"method":"startup/storagePathReady","reuse":true}\n'));reused.lines[0].emit('line',JSON.stringify({method:'startup/storagePrepared',params:{}}));reused.workers[0].emit('exit',0);await reuse;
 const late=fixture(),latePath=defer();late.setPath(latePath.promise);const lateSet=new Set();const latePromise=late.api.prepareSessionStorage({cwd:'/synthetic/late',signal:signalPort(),preparedPaths:lateSet,observePath(){assert.fail('settled must skip observe');},report(){}});late.lines[0].emit('line',JSON.stringify({method:'startup/storagePath',params:{path:'/synthetic/late-data'}}));late.lines[0].emit('line',JSON.stringify({method:'startup/storagePrepared',params:{}}));late.workers[0].emit('exit',0);await latePromise;latePath.resolve('/synthetic/late-canonical');await drain();assert.equal(lateSet.size,0);assert.equal(late.calls.some(call=>call[0]==='write'),false);
 const failed=fixture(),failSignal=signalPort(),fail=failed.api.prepareSessionStorage({cwd:'/synthetic/fail',signal:failSignal,observePath:async()=>{},report(){}});failed.lines[0].emit('line',JSON.stringify({method:'synthetic/bad',params:{}}));assert.equal(failed.workers[0].terminations,1);failSignal.abort();failed.workers[0].emit('exit',1);await assert.rejects(fail,error=>error===failed.parseError);
});
