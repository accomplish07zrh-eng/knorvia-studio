// Synthetic collaborators only. No canonical provider/cache/network/file dependency is loaded.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
async function until(fn){for(let n=0;n<30;n++){if(fn())return;await Promise.resolve()}assert.fail('synthetic progress condition not reached')}
function setup(file){
 const env={trace:[],sources:[],syncs:[],plans:[],endpoint:'a-raw',resolverCalls:0};
 const options={bundledFilePath:'synthetic-bundled',environmentConfigRoot:'synthetic-root',platform:'synthetic-platform',appVersion:'synthetic-version',watch:false,resolveEndpointOrigin:function(){assert.equal(this,options);env.resolverCalls++;return env.resolver?env.resolver():env.endpoint},fetchRelease:async()=>{assert.fail('fake refresh must not call fetchRelease')},onRefreshResult:()=>{assert.fail('fake refresh must not call onRefreshResult')}};
 class Source{
  constructor(o){assert.deepEqual(Object.keys(o),['bundledFilePath','activeFilePath','watch']);this.o=o;this.id=env.sources.length+1;this.plan=env.plans.shift()??{};this.count=0;this.snapshots=[];this.listener=null;this.disposed=0;env.sources.push(this);env.trace.push(`source${this.id}:new`)}
  async read(){assert.ok(env.sources.includes(this));this.count++;env.trace.push(`source${this.id}:read${this.count}`);if(this.count===1){if(this.plan.gate)await this.plan.gate.promise;if(this.plan.error)throw this.plan.error;if(this.plan.primeReason)this.listener?.(this.plan.primeReason)}const snapshot={revision:`synthetic:${this.id}:${this.count}`,providers:{fake:true},models:{fake:true}};this.snapshots[this.count]=snapshot;return snapshot}
  onDidChange(listener){assert.equal(this.listener,null);this.listener=listener;const source=this;env.trace.push(`source${this.id}:subscribe`);return function(){const mode=this===undefined?'unbound':this.source===source&&this.synchronizer===env.syncs.find(s=>s.o.source===source)&&this.activeFilePath===source.o.activeFilePath&&typeof this.sourceDispose==='function'?'bundle':'wrong';env.trace.push(`source${source.id}:unsubscribe:${mode}`);if(source.plan.unsubscribeError)throw source.plan.unsubscribeError;source.listener=null}}
  dispose(){assert.ok(env.sources.includes(this));this.disposed++;env.trace.push(`source${this.id}:dispose`)}
  emit(reason){this.listener?.(reason)}
 }
 class Sync{
  constructor(o){assert.deepEqual(Object.keys(o),['source','controlFilePath','resolveEndpointKey','fetchRelease','onRefreshResult']);assert.equal(o.fetchRelease,options.fetchRelease);assert.equal(o.onRefreshResult,options.onRefreshResult);this.o=o;this.id=env.syncs.length+1;this.disposed=0;env.syncs.push(this);env.trace.push(`sync${this.id}:new`)}
  async refresh(o){assert.ok(env.syncs.includes(this));env.lastRefresh=o;env.trace.push(`sync${this.id}:refresh`);return 'unchanged'}
  dispose(){assert.ok(env.syncs.includes(this));this.disposed++;env.trace.push(`sync${this.id}:dispose`)}
 }
 const ports={
  './builtin-cache-paths.js':{normalizeKnorviaBuiltinEndpointOrigin(value){assert.ok(['a-raw','a-spelling','b-raw'].includes(value));return value==='b-raw'?'origin-b':'origin-a'},resolveKnorviaBuiltinCachePaths(o){assert.deepEqual(Object.keys(o),['environmentConfigRoot','platform','appVersion','knorviaEndpointOrigin']);assert.equal(o.environmentConfigRoot,options.environmentConfigRoot);assert.equal(o.platform,options.platform);assert.equal(o.appVersion,options.appVersion);return {activeFilePath:`synthetic-active:${o.knorviaEndpointOrigin}`,controlFilePath:`synthetic-control:${o.knorviaEndpointOrigin}`}}},
  './builtin-provider-config-source.js':{NodeKnorviaBuiltinProviderConfigSource:Source},
  './builtin-remote-synchronizer.js':{KnorviaBuiltinRemoteSynchronizer:Sync}
 };
 const text=fs.readFileSync(file,'utf8'),compiled=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});assert.equal((compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const module={exports:{}};vm.runInNewContext(compiled.outputText,{module,exports:module.exports,require(name){assert.ok(Object.hasOwn(ports,name),'unexpected real dependency:'+name);return ports[name]},Error,Set,Promise},{filename:'synthetic-owner.js'});
 const owner=new module.exports.EndpointScopedKnorviaBuiltinSource(options);return {env,options,owner};
}
async function scenarios(file){const report={};
 {
  const {env,owner}=setup(file),resolver=deferred(),prime=deferred();env.resolver=()=>resolver.promise;env.plans.push({gate:prime});const events=[];const listener=reason=>events.push(reason);const off=owner.onDidChange(listener);owner.onDidChange(listener);
  assert.equal(env.sources.length,0);const request={force:true};const read=owner.read(),path=owner.resolveActiveFilePath(),refresh=owner.refresh(request);assert.equal(env.resolverCalls,1);resolver.resolve('a-raw');await until(()=>env.sources[0]?.count===1);assert.equal(env.sources.length,1);prime.resolve();const [snapshot,active,result]=await Promise.all([read,path,refresh]);assert.equal(snapshot,env.sources[0].snapshots[2]);assert.equal(active,'synthetic-active:origin-a');assert.equal(result,'unchanged');assert.equal(env.lastRefresh,request);env.resolver=null;env.endpoint='a-spelling';await owner.resolveActiveFilePath();assert.equal(env.sources.length,1);env.sources[0].emit('same-source');assert.deepEqual(events,['same-source']);env.endpoint='b-raw';assert.equal(await env.syncs[0].o.resolveEndpointKey(),'origin-b');assert.equal(off(),true);assert.equal(off(),false);owner.dispose();owner.dispose();report.coalescedIdentityAndDynamicEndpoint={sources:env.sources.length,primePlusPublicReads:env.sources[0].count,events,result,trace:env.trace};
 }
 {
  const {env,owner}=setup(file),events=[];owner.onDidChange(r=>events.push(r));await owner.resolveActiveFilePath();env.endpoint='b-raw';env.plans.push({primeReason:'new-prime'});const result=await owner.read();assert.equal(result,env.sources[1].snapshots[2]);assert.deepEqual(events,['new-prime','endpoint-changed']);assert.deepEqual(env.trace.filter(x=>x.includes('unsubscribe')||x.includes('dispose')),['source1:unsubscribe:bundle','sync1:dispose','source1:dispose']);owner.dispose();report.switchOrder={events,trace:env.trace};
 }
 {
  const {env,owner}=setup(file),failure=new Error('synthetic prime rejection');await owner.resolveActiveFilePath();env.endpoint='b-raw';env.plans.push({error:failure});await assert.rejects(owner.read(),e=>e===failure);assert.deepEqual(env.trace.filter(x=>x.includes('unsubscribe')||x.includes('dispose')),['source2:unsubscribe:unbound','sync2:dispose','source2:dispose']);env.endpoint='a-raw';const result=await owner.read();assert.equal(result,env.sources[0].snapshots[2]);assert.equal(env.sources.length,2);owner.dispose();report.failedPrime={trace:env.trace,previousRetained:true};
 }
 {
  const {env,owner}=setup(file),gate=deferred();env.plans.push({gate});const pending=owner.resolveActiveFilePath();await until(()=>env.sources[0]?.count===1);owner.dispose();gate.resolve();await assert.rejects(pending,/EndpointScopedKnorviaBuiltinSource 已 dispose/);const calls=env.resolverCalls;await assert.rejects(owner.read(),/EndpointScopedKnorviaBuiltinSource 已 dispose/);assert.throws(()=>owner.onDidChange(()=>{}),/EndpointScopedKnorviaBuiltinSource 已 dispose/);assert.equal(env.resolverCalls,calls);assert.deepEqual(env.trace.filter(x=>x.includes('unsubscribe')||x.includes('dispose')),['source1:unsubscribe:unbound','sync1:dispose','source1:dispose']);report.disposalDuringPrime={trace:env.trace};
 }
 {
  const {env,owner}=setup(file),events=[];let removeB;function c(r){assert.equal(this,undefined);events.push('c:'+r)}function a(r){assert.equal(this,undefined);events.push('a:'+r);removeB();owner.onDidChange(c)}function b(r){events.push('b:'+r)}owner.onDidChange(a);removeB=owner.onDidChange(b);await owner.resolveActiveFilePath();env.sources[0].emit('live');assert.deepEqual(events,['a:live','c:live']);owner.dispose();report.liveListeners={events};
 }
 {
  const {env,owner}=setup(file),failure=new Error('synthetic unsubscribe failure');env.plans.push({unsubscribeError:failure});const off=owner.onDidChange(()=>assert.fail('disposed emission'));await owner.resolveActiveFilePath();assert.throws(()=>owner.dispose(),e=>e===failure);owner.dispose();env.sources[0].emit('ignored');assert.equal(env.syncs[0].disposed,0);assert.equal(env.sources[0].disposed,0);assert.equal(off(),true);await assert.rejects(owner.read(),/EndpointScopedKnorviaBuiltinSource 已 dispose/);report.disposalFailure={trace:env.trace};
 }
 {
  const {env,owner}=setup(file);let nested,entered=false;env.resolver=()=>{if(!entered){entered=true;nested=owner.resolveActiveFilePath();return 'a-raw'}return 'b-raw'};const outer=owner.resolveActiveFilePath();const values=await Promise.all([outer,nested]);report.resolverReentrancy={values,resolverCalls:env.resolverCalls,sources:env.sources.length};owner.dispose();
 }
 {const {owner}=setup(file);report.runtimePrivacy={ownEnumerableKeys:Object.keys(owner)};owner.dispose()}
 return report;
}
(async()=>{const [baseline,candidate,output]=process.argv.slice(2);assert.ok(baseline&&candidate&&output,'baseline candidate output required');const original=await scenarios(baseline);let proposed,failure;try{proposed=await scenarios(candidate);assert.deepEqual(proposed,original)}catch(error){failure={message:error.message,stack:error.stack}}const result={mode:'TS transpile + VM with explicit fake-only dependency allowlist; no real provider/network/file collaborator',baseline,candidate,scenarioGroups:8,original,proposed:proposed??null,failure:failure??null,status:failure?'FAIL':'PASS',fullsuiteBuild:false,realEndpointProviderNetworkCacheConfigCredentialsPermissionsNative:false};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,scenarioGroups:8,failure:failure?.message??null}));if(failure)process.exitCode=1})().catch(error=>{console.error(error);process.exitCode=1});
