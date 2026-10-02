# Provider HTTP owners — behavior/API contract

Complete providers/api owner set: apiKeyHeaders.ts,apiJson.ts,networkErrorClassifier.ts,requestIdHeaders.ts,nodeApiClient.ts,nodeApiNetwork.ts; index.ts public export surface retained (declaration-only, can author same exports). Full fresh behavior/API implementation; not extraction of inherited expressions. Own helper files under providers/api allowed <400 nonblank; no lint suppression. Services unmanaged legacy, retain shared ApiError/createUuid declaration and undici/node contracts. No production/actual network, credentials/tokens or real CA file reads in author/validation. No authentication or TLS/security policy change; preserve existing explicit-only request/CA/proxy/fail-closed behavior. Ordinary tests/builds skipped; no new persistence path => scoped types/lint/architecture + source review only. Existing endpoints/settings data untouched.

## API headers

normalizeApiKeyForHeader(value:string):string. value.trim(), strip leading /^Bearer\s+/i once then trim. Find FIRST ANYWHERE substring /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/; ifmatchedreturnit unchanged. Else match anchored leading /^[\x21-\x7e]+/ visible nonspaceASCII; none→'',else matchedprefix.trim(). No parsing/decode/credentials read.
REQUEST_ID_HEADER_NAME constant 'x-request-id'. withRequestIdHeader(headers:RequestInit['headers']|undefined):Headers creates new Headers(headers), if !has(name) add createUuid(), existing empty stillcounts; returnnew. withRequestIdHeaderRecord sameinput->Record<string,string>: new ordinary{}; if Headers useforEach(key normalizedbyHeaders); ifarray assigneach exactkey/value withlast duplicate samecase wins; iftruthyobject Object.entries value String(value); caseinsensitive existingkey detection Object.keys.toLowerCase; absent add createUuid underlowercasekey. Do not mutateoriginal/dedupevariantkey/proto-hardening. Preserve ordinary{} assignment behavior. createUuid retained sharedfn, no bodyread.

## Node client

NodeApiClientOptions (not exported) fetchImpl?:typeof fetch. exported class NodeApiClient implements ApiClient constructor(private readonly options:NodeApiClientOptions={}); createNodeApiClient(options={}):ApiClient newclass. request(input:string|URL,init?:ApiRequestInit):Promise<Response> ASYNC. BEFORE try compute url=String(input),method=(init?.method??'GET').toUpperCase(),timeoutMs=init?.timeoutMs. controller iftimeoutMs truthy&&>0 else null. didTimeout=false; timer=controller&&timeoutMs?setTimeout(()=>{didTimeout=true;controller.abort()},timeoutMs):null. In try signal=controller? init?.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal :init?.signal. Ifsignal?.aborted throw DOMException('The operation was aborted.','AbortError') before header construction/fetch. Invoke (LIVE this.options.fetchImpl??globalThis.fetch)(ORIGINAL input,{...init,headers:withRequestIdHeader(init?.headers),...(signal?{signal}:{})}); extra timeoutMs field stays due spread; no URL rewriting/auth header/account injection. Return awaited response unchanged. Catch: existing ApiError throw SAME; else new ApiError({message:didTimeout&&timeoutMs?`Request timed out after ${timeoutMs}ms`:error instanceof Error?error.message:String(error),url,method,cause:error}). Finally iftimertruthy clearTimeout. No actual AbortError passthrough otherthanApiError. Body parsing outsideclient. Changing dependencies object fetchImpl affects laterrequests; do not cache.

## JSON response

readApiJson<T>(apiClient:ApiClient,input:string|URL,init?:ApiRequestInit):Promise<T>. BEFORErequesturl=typeofinputstring?input:input.toString;method defaultGET uppercase. awaitapiClient.request(originalinput,originalinit) OUTSIDE parsecatch; requesterroridentity preserved. For!response.ok: awaitmessage parser then throw newApiError({message,url,method,status:response.status,responseHeaders:diagnosticheaders}); no cause.
Errorbodymessageparser tryawaitresponse.text(); trim; ifemptyHTTPstatus; tryJSON.parse(trimmed) -> take FIRST property with typeof==='string' in precedence error,message,msg,detail (even emptystring wins then fallback HTTP, do notskipempty to nextfield). Return chosen.trim()||`HTTP ${response.status}`. JSON parse/accesserror catch inner ->rawtrimmed; outertext/trim error ->HTTPstatus. Primitive JSON string/number parsed may nofields→HTTP; nullpropertyaccess caught→rawtrimmed 'null'. Do not stringify nonstring nestederrors.
Success tryawaitresponse.json() castT;catch newApiError({message:error instanceof Error?error.message:'Invalid JSON response',url,method,status,responseHeaders,cause:error}). Diagnostic read names x-request-id,x-trace-id,x-span-id inthatorder; headers.get(name)?.trim(); includetruthyvalue; returnundefined ifnone elseordinaryrecord. Headererrorspropagate outsideconstruction naturally. No full responsebody/content clone/retries.
Shared API shape: ApiRequestInit extends RequestInit timeoutMs?:number; ApiClient request(...):Promise<Response>; ApiError constructor options message:string,url:string,method:string,status?:number,responseHeaders?:Record<string,string>,cause?:unknown; classinstance identity retained. No shared source body read.

## Error graph classifier

getNetworkErrorCodes(error:unknown):string[] sortedunique; isNetworkFailure(error):boolean; isRetryableConnectionEstablishmentError(error):boolean. Graphreadonly noerrorrewrite. Traversal iterative LIFO pending=[error],seenSetobject; whilepop: skipfalsy/nonobject/alreadyseen; markseen. record code string→Set, message string→messages; cause!==undefined pushcause; Array.isArray(errors) thenpush...errors. Children errors traversed reversearray beforecause asstack. Arrays themselvesallowedobjects; functionsignored. Getters/proxythrows propagate, noexceptionguard.
Network set UND_ERR_CONNECT_TIMEOUT,UND_ERR_CONNECT_ERROR,ENOTFOUND,ETIMEDOUT,ENETUNREACH,EHOSTUNREACH,ECONNREFUSED,ECONNRESET. Retrybase set same exceptETIMEDOUT/ECONNRESET. Retrytrue ifanybasecode; else ETIMEDOUT present ANDany message /connection attempts timed out|connect ETIMEDOUT/i; else ECONNRESET present ANDany message /before secure TLS connection was established/i;elsefalse. Message evidence neednotbesamegraphnodeascode. No retry ongeneric postbody timeout/reset.

## Host network configuration/routing

Export HostApiNetworkOptions {httpProxy?:string,noProxy?:string,caCertPath?:string}; HostApiNetworkTransport {fetch:typeof fetch,dispose():void,disposeAndWait():Promise<void>}. Private HostProxyRoute=direct{kind:'direct',noProxyMatched?:boolean}|proxy{kind:'proxy',proxyUrl:string}|invalid{kind:'invalid',reason:string}. resolveHostProxyForUrl(requestUrl:string|URL,options):HostProxyRoute.
Parse URL only wheninputstring inside try,else useURLobject asgiven. Parsefailure→direct. Onlyhttp/https URLs route;otherprotocol direct. noProxy parser: url.hostname.lower, port explicit||https443else80; (value??'').split(/[\s,]+/) each trimlower;emptyfalse,'_'true. strip anchored scheme /^[a-z][a-z\d+.-]_:\/\//; split':' destructure firsthost,secondport,ignoreotherparts (noIPv6fix). host strip leading /^\*\.?/ then leading /^\./. Emptyhostfalse. Matchhostexact ORends'.'+host and(!rulePort||rulePort===effectiveport). noProxy matches→{kind:'direct',noProxyMatched:true} BEFORE readingproxy. configuredProxy=options.httpProxy?.trim(); falsy→direct. normalization if /^\w[\w+.-]\*:\/\// prefix then unchanged elseprependhttp://; parseURL, requirehostname ANDprotocolhttp/https elseundefined; returnsurl.href normalized includingtrailing/. Invalid->{kind:'invalid',reason:'Configured Host proxy URL is invalid'}. No envproxy/systemproxyglobalhook.

## Host transport factory/lifetime

createHostApiNetworkTransport(resolveOptions:()=>Promise<HostApiNetworkOptions>,dependencies:HostApiNetworkTransportDependencies={}):HostApiNetworkTransport. Private deps optional createDispatcher?:typeofinternalcreateDispatcher;fetchWithDispatcher?:(input:string,init:Omit<RequestInit,'dispatcher'>&{dispatcher:Dispatcher})=>Promise<Response>. Factory captures deps functions ONCE (unlikeNodeApiClient): dispatcherFactory=deps.createDispatcher??default; fetchWithDispatcher=deps.fetchWithDispatcher??wrapperundiciFetch(input,init as never) as unknown as Promise<Response>, TYPE assertion only; return original response identity with no Response/body/header adaptation. Retain deferred options; no request untilfetchcalled. State one optionsPromise optional,Map<string,Promise<Dispatcher>>,disposed=false,generation=0,pendingcreationcount,optionaldoneResolver/donePromise, lateDisposePromises:Promise<void>[], cacheddisposePromise optional,disposeMode close|destroy optional.
Fetch ASYNC: ifdisposedthrowError('Host API network transport has been disposed'); capture requestGeneration. If!optionsPromise setresolveOptions().catch(error=>{optionsPromise=undefined;throwerror}) (sync throw precedes cache). awaitoptions; ifdisposed||generationchanged sameerror. requestURL=input instanceof Request?input.url:String(input); resolve route. invalidthrowError(reason) withno directfallback. Ifdirect&&!options.caCertPath returnglobalThis.fetch(originalinput,init) LIVEglobal receiver call; no dispatcher or request mutation. CA configured evenempty? truthycheck exactly, whitespacepathtruthy.
Dispatcherkey `${route.kind}:${route.kind==='proxy'?route.proxyUrl:'direct'}:${options.caCertPath??''}`. Getcachedpromise. Absent: ifdisposedthrowdisposed; capturedispatcherGeneration; incrementpendingcount BEFORE dispatcherFactory(route,options.caCertPath); assign returnedpromiseandcache. Syncfactorythrow leavespendingcount asbaseline (do not fix). Attach observer `.then(dispatcher=>{if((disposed||generationchanged)&&map.get(key)===dispatcherPromise){map.delete(key);cleanupPromise=Promise.resolve(disposeMode==='close'?dispatcher.close():dispatcher.destroy()).catch(()=>{});lateDisposePromises.push(cleanupPromise)}}).catch(()=>{})`. NOTE disposal clearscache before late completion, so guard mayfalse and snapshot path handles it; preserve these exact lifetime rules, notadhoctwodisposal.
Attach markCreationDone success/failure tooriginalpromise: decrementcount; ifzero call doneResolver?.();setdoneResolverundefined. Attach rejection cleanup originalpromise.catch(()=>{ifcacheidentitysame deletekey}); nofallback, originalerror propagated. awaitdispatcher; afterawaitifdisposed||requestGenerationchanged disposederror; else fetchWithDispatcher(ORIGINAL input TYPE-cast string, {...init,dispatcher}) preserving Request/URL object atruntime (doNOT String/coercefortransport). Awaitreturns response; no errorwrapping.
startDispose(mode): NON-async returns EXACT cachedPromise ifpresent; first setdisposed=true,generation+=1,disposeMode=mode; snapshotmap.values,clearcache; ifpendingcount>0 setupdonePromise resolver. disposePromise=(async()=>{awaitPromise.allSettled(snapshot.map(asyncpromise=>{constd=awaitpromise;modeclose?awaitd.close():awaitd.destroy()}));awaitdonePromise;awaitPromise.all(lateDisposePromises)})();returndisposePromise. Rejectedcreation/close/destroy swallowedbyallSettled; latecleanupalready catches. Firstclose/destroy mode wins, no subsequent modechange; pendingrequests reject afterawait; optionsresolution notawaitedbydispose. dispose() void startDispose('destroy'); disposeAndWait() returnstartDispose('close') samePromise. Do not call twice perdispatcher, addgraceful timers/abort or changeerrorpolicies. no globalfetch rewrite.
DefaultcreateDispatcher(route excludesinvalid,caCertPath:string|undefined):Promise<Dispatcher>. constcustomCa=caCertPath?awaitreadFile(path,'utf8'):undefined;ca=customCa?[...rootCertificates,customCa]:undefined (defaulttrust preserved, no emptycustom added). Proxy ->new ProxyAgent({uri:route.proxyUrl,proxyTls:ca?{ca}:undefined,requestTls:ca?{ca}:undefined}) INCLUDINGundefined properties. Direct ->new Agent({connect:ca?{ca}:undefined}). No cert validation/bypass alteration, do not read actual CA duringvalidation. These retained dependency classes own sockets.

## Export surface

index.ts exact exports: readApiJson from apiJson;normalizeApiKeyForHeader from apiKeyHeaders;NodeApiClient,createNodeApiClient fromnodeApiClient;createHostApiNetworkTransport,resolveHostProxyForUrl,typeHostApiNetworkOptions,typeHostApiNetworkTransport fromnodeApiNetwork. requestID/classifier direct-moduleexports only, do not addbarrel exports. Public declaration appendix follows; private API declarations included solelyforcompat shape.

## Provenance/acceptance

Coordinator readold bodies and frozehashes. Fresh Solhigh author no inheritedbody/history/test/dependency bodies; packet behavior and import/API type syntaxonly. Tiny helpers and schemas may naturally share conventional expression; retained declarations/constants/wiregrammar explicit, no noveltyrequired, no blanketMIT/packageindependence. Original providers scopedtypes passed afterisolatedundici6.23.0 install usingtmpcache/prefix, no repo manifests changed. Final scope type/lint/architecture+review; ordinarytest/build/stress/platform/liveHTTP/proxy/CA/cancellation/errorgraphacceptance deferred. No deployment/main/crosslane/license/inventory changes.

## Verified declaration-only appendix

### apiJson.ts

```ts
import { ApiError, type ApiClient, type ApiRequestInit } from "@knorvia/shared";

export async function readApiJson<T>(
  apiClient: ApiClient,
  input: string | URL,
  init?: ApiRequestInit,
): Promise<T>;
```

### apiKeyHeaders.ts

```ts
export function normalizeApiKeyForHeader(value: string): string;
```

### index.ts

```ts
export { readApiJson } from "./apiJson.js";

export { normalizeApiKeyForHeader } from "./apiKeyHeaders.js";

export { NodeApiClient, createNodeApiClient } from "./nodeApiClient.js";

export {
  createHostApiNetworkTransport,
  resolveHostProxyForUrl,
  type HostApiNetworkOptions,
  type HostApiNetworkTransport,
} from "./nodeApiNetwork.js";
```

### networkErrorClassifier.ts

```ts
interface NetworkErrorDetails {
  codes: Set<string>;
  messages: string[];
}

export function getNetworkErrorCodes(error: unknown): string[];

export function isNetworkFailure(error: unknown): boolean;

export function isRetryableConnectionEstablishmentError(error: unknown): boolean;
```

### nodeApiClient.ts

```ts
import { ApiError, type ApiClient, type ApiRequestInit } from "@knorvia/shared";

import { withRequestIdHeader } from "./requestIdHeaders.js";

interface NodeApiClientOptions {
  fetchImpl?: typeof fetch;
}

export function createNodeApiClient(options: NodeApiClientOptions = {}): ApiClient;
```

### nodeApiNetwork.ts

```ts
import { readFile } from "node:fs/promises";

import { rootCertificates } from "node:tls";

import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export interface HostApiNetworkOptions {
  httpProxy?: string;
  noProxy?: string;
  caCertPath?: string;
}

export interface HostApiNetworkTransport {
  fetch: typeof fetch;
  dispose(): void;
  disposeAndWait(): Promise<void>;
}

type HostProxyRoute =
  | { kind: "direct"; noProxyMatched?: boolean }
  | { kind: "proxy"; proxyUrl: string }
  | { kind: "invalid"; reason: string };

export function resolveHostProxyForUrl(
  requestUrl: string | URL,
  options: HostApiNetworkOptions,
): HostProxyRoute;

interface HostApiNetworkTransportDependencies {
  createDispatcher?: typeof createDispatcher;
  fetchWithDispatcher?: (
    input: string,
    init: Omit<RequestInit, "dispatcher"> & { dispatcher: Dispatcher },
  ) => Promise<Response>;
}

export function createHostApiNetworkTransport(
  resolveOptions: () => Promise<HostApiNetworkOptions>,
  dependencies: HostApiNetworkTransportDependencies = {},
): HostApiNetworkTransport;
```

### requestIdHeaders.ts

```ts
import { createUuid } from "@knorvia/shared";

export function withRequestIdHeader(headers: RequestInit["headers"] | undefined): Headers;

export function withRequestIdHeaderRecord(
  headers: RequestInit["headers"] | undefined,
): Record<string, string>;
```
