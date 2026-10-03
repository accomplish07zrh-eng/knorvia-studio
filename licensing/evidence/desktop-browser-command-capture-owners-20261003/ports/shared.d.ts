export type BrowserKeyModifier='Alt'|'Control'|'ControlOrMeta'|'Meta'|'Shift';
export type BrowserMouseButton='left'|'right'|'middle';
export type BrowserPageState={url:string;scrollX?:number;scrollY?:number;viewportWidth?:number;viewportHeight?:number};
export type BrowserCommandResult={ok:boolean;elapsedMs:number;state?:BrowserPageState;image?:{base64:string;mimeType:string};value?:unknown;snapshot?:unknown;element?:unknown;error?:{code:string;message:string;sideEffect?:string}};
export type BrowserCommand=(
{method:'click';ref?:string;x?:number;y?:number;button?:BrowserMouseButton;doubleClick?:boolean;modifiers?:BrowserKeyModifier[]}|
{method:'hover';ref?:string;x?:number;y?:number;modifiers?:BrowserKeyModifier[]}|
{method:'type';ref?:string;text:string}|
{method:'press';ref?:string;key:string;modifiers?:BrowserKeyModifier[]}|
{method:'cuaKeypress';keys:string[]}|
{method:'scroll';ref?:string;x?:number;y?:number}|
{method:'cuaScroll';x:number;y:number;scrollX:number;scrollY:number;modifiers?:BrowserKeyModifier[]}|
{method:'domCuaScroll';nodeId?:string;scrollX:number;scrollY:number}|
{method:'select';ref:string;values:string[]}|
{method:'check';ref:string;checked?:boolean}|
{method:'drag';fromRef?:string;toRef?:string;from?:{x:number;y:number};to?:{x:number;y:number};modifiers?:BrowserKeyModifier[]}|
{method:'cuaDrag';path:Array<{x:number;y:number}>;modifiers?:BrowserKeyModifier[]}|
{method:'elementInfo';x:number;y:number}|
{method:'navigate';url:string}|
{method:'getState'}|
{method:'screenshot';ref?:string;fullPage?:boolean;clip?:{x:number;y:number;width:number;height:number}}|
{method:'snapshot';maxElements?:number;includeHidden?:boolean}|
{method:'evaluate';expression:string}|{method:'back'}|{method:'forward'}|{method:'reload'}|{method:'playwright';action:unknown}|{method:'fill'|'waitFor'|'capabilities'|'getDialog'|'handleDialog'|'close'|'list'|'playwrightWaitForTimeout'}) & {tabId?:string};
