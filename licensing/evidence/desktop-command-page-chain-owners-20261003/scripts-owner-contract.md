# Complete generated command page-program owner

Output /tmp/knorvia-scripts47-initial.ts. Read common, this file and ports/scripts.d.ts.
No imports/new exported helpers. Produce complete executable JS string programs,
not an inherited literal copy. Six generators plus retained VIEWPORT_SCRIPT public
fixed glue value in port declaration; preserve that small exact value, zero credit.
Returned script formatting/names may change, runtime results/ref side effects and
error propagation must match. Private shared helpers allowed within this same owner.

SNAPSHOT_SCRIPT(maxElements?,includeHidden?) -> IIFE script. max=typeofnumber && >0
?Math.floor(maxElements):200 (Infinity retained, positive fraction floors0); hidden
only ===true. Separate semantic DOM limit300. Query document action selector exact:
'a[href], button, input, textarea, select, [role], [onclick], [tabindex], summary, label, [contenteditable]'.
Semantic selector exact:
'body, main, nav, header, footer, aside, section, article, h1, h2, h3, h4, h5, h6, p, ul, ol, li, dl, dt, dd, blockquote, pre, code, table, caption, thead, tbody, tfoot, tr, th, td, form, fieldset, legend, figure, figcaption, img, canvas, svg, a[href], button, input, textarea, select, option, summary, label, [role], [aria-label], [contenteditable]'.
Do not expand shadow/iframe/cursor selection, permissions or stored data scope.

Inside snapshot: try window.__knorviaRefs=new Map(), catch assign null (second
assignment not caught). Element->ref WeakMap only if typeof WeakMap!=='undefined',
else null. Viewport window.innerWidth||document.documentElement.clientWidth||0 and
height analogous. Hidden predicate try getComputedStyle(element); absent style false;
true if display==='none' OR visibility==='hidden' OR opacity==='0'; else read rect,
true if width<=0 AND height<=0; catch false. No negative/zero dimension correction.

Shared per-element semantics:
safe ID regexp /^[A-Za-z][A-Za-z0-9_-]*$/ only; selector if safe el.id -> '#'+id,
otherwise ancestor chain at most6 elements while nodeType===1, nearest safe ID ends
chain, each lower tag+':nth-of-type('+1+number same-tag previous siblings+')', join
' > '. XPath safe own ID -> "//*[@id='"+id+"']", else full ancestor chain nodeType1,
same sibling counts, '/'+parts.join('/'), no depth cap. No escaping/general selector.
Accessible name: first truthy aria-label/alt/title/placeholder, else innerText||
textContent||'', then (n||'').trim().slice(0,120), no whitespace collapse/coercion.
Implicit role: href!=null anchor link; button/summary button; select combobox;
textarea textbox; input type(getAttribute('type')||'text').toLowerCase():checkbox,
radio, button/submit/reset button, search searchbox, otherwise textbox; else ''.
Attribute dict ordered keys id,href,name,type,placeholder,title,alt,role,aria-label,
data-testid,data-test,data-qa: value!=null && String(value).trim()!=='' -> trimmed
String(value).slice(0,240), preserve repeated reads/conversions, no added keys.

Action loop query order, skip hidden only when !include; BEFORE assigning next ref
if count>=max -> truncatedtrue break; count++ e1,e2,..., put actual element in map
iftruthy and WeakMap ifpresent. Rect read same object values x/y/width/height Math.round;
inViewport uses raw top<vh && bottom>0 && left<vw && right>0. Output property order
ref,tag,selector,xpath,rect,inViewport; optional nearest selected ancestor parentRef
by walking parentElement and WeakMap (ancestor refs assigned in document order).
role explicit attr truthy else implicit, optional iftruthy; optional name iftruthy;
text only (innerText||'').trim().slice(0,100), optional iftruthy (no textContent fallback).
Optional attrs if Object.keys nonempty. input/textarea/select value!=null and!==''
=>String live value. disabled only===true. Input checkbox/radio .type property exact
=>checked=.checked===true. No extra booleans/fields/selector result copies.

Semantic DOM loop query order independently; skip hidden; if dom.length>=300 set
domTruncatedtrue break. Rect read for raw viewport; taglower; depth body itself0,
else parent chain while parent exists and !==document.body increment once per node
(direct body child0). Base order tag,depth,inViewport; optional ref if WeakMap has
element. Same role/attrs. Semantic name: first truthy four naming attrs; if absent
and tag is a/button/input/textarea/select/summary use accessibleName; then
String(n||'').trim().replace(/\s+/g,' ').slice(0,120). Semantic text only tags
h1..h6,p,li,dt,dd,blockquote,pre,code,caption,th,td,label,summary,button,a,option,legend,
figcaption: String(innerText||textContent||'').trim().replace(/\s+/g,' ').slice(0,300),
else ''. Append optional role/name/text/attrs iftruthy/nonempty. No action value/
disabled/checked in semantic records. Return object property order url:location.href,
title:document.title,dom,domTruncated,elements,truncated (DOM first output preview).

RESOLVE_SCRIPT(ref): JSON.stringify ref into JS literal, no escaping substitute.
IIFE capture window.__knorviaRefs, el=map&&map.get(ref); falsey -> null. Otherwise
bound el.scrollIntoView({block:'center',inline:'center'}); reread rect after scroll,
return {cx:round(left+width/2),cy:round(top+height/2)}. No catch/sanitization.

SELECT_SCRIPT(ref,values readonly strings): interpolate both via JSON.stringify.
Map/element falsey ->{error:'ref_not_found'}; missing tagName or lower !==select ->
{error:'not_select'}. Clear every option.selected=false FIRST. For each requested
value, scan options index order exact option.value===wanted, first match selected,
markfound/matched then break. If no exact match, scan text||(empty) .trim()===
String(wanted).trim(), first only. Multiple requested values may select several;
no rollback on no-match or missing entries, no forced select.value. If none matched
return {error:'no_match'} leaving cleared flags. Else bound el.dispatchEvent new
GLOBAL Event('input',{bubbles:true}) then new Event('change',{bubbles:true}), return
{ok:true}. No events on failures, no composed/cancelable additions/catches.

CHECK_SCRIPT(ref,checked): JSON.stringify ref, want literal checked truthy?'true':'false'.
Missingref error ref_not_found. tag=tagName?lower:''; type=((el.getAttribute&&
el.getAttribute('type'))||'').toLowerCase(); require tag input and type checkbox/radio
else not_checkable. If el.checked!==want bound el.click(), no direct setter/events;
return {ok:true,checked:el.checked===true} even if click didn't change state.

ELEMENT_AT_POINT_SCRIPT(x,y): interpolate each JSON.stringify value (NaN/Infinity ->null).
document.elementFromPoint(x,y) bound; null/non nodeType1 ->null. Same safeID/selector/
XPath/name/role logic as action records; no attrs or parentRef added. If refs map
falsey try new Map assignment elsecatchassignnull. Then __knorviaPtSeq=(old||0)+1
(no numeric normalization), ref='p'+seq; put element in truthy refs. viewport/rect/
inViewport, order ref,tag,selector,xpath,rect,inViewport; optionalrole/name/actiontext,
value/disabled/checked as action records. No new reference reset or authority scope.

EVALUATE_SCRIPT(expression): expression source inserted unchanged in inner function
return (EXPRESSION newline); invocation. Outer try value result; try JSON.stringify
value, catch set undefined. If typeof serialized==='string' return {ok:true,kind:
'json',data:serialized}; else {ok:true,kind:'str',data:String(value)}. Outer catch
returns {ok:false,message:(err&&err.message)?String(err.message):String(err)}.
No async await/sanitization/truncation/caught syntax compile errors: malformed input
still generates malformed source, caught only by VM compilation outside program.
