# Complete virtual paste page-program owner

Output /tmp/knorvia-paste47-initial.ts. Read common, this file, ports/paste.d.ts only.
No imports/extra exports. Export fixed IAB_INPUT_TARGET_TOKEN_PROPERTY exact
'__knorviaIabInputTargetToken' (zero independent credit) and VIRTUAL_PASTE_PAGE_FUNCTION
containing complete async(options)=>{...} function source, no execution on import.
It receives clipboardItems array of items with entries{mime_type,text}, optional
inputTargetToken, richTextFallback, replaceInputValue. Program string whitespace/
internal names may change; literal-source type difference is transparently recorded.
Never include the inherited substantive function literal in type/port declarations.

asElement(target): null if target nullish, typeof!=='object', or no 'ownerDocument'
property via in operator. Otherwise view=target.ownerDocument?.defaultView??null;
require view!=null and target instanceof view.Element else null. No added constructor
guards/catches or support for functions. elementWindow(el) returns
el.ownerDocument.defaultView??window (not optional ownerDocument).

deepestActiveElement(root): read root.activeElement, nullish=>null. view from active
ownerDocument. If active instanceof view.HTMLElement and shadowRoot nonnull, recurse
into shadowRoot then nullish fallback active. If iframe OR frame instanceof own-realm
HTMLIFrameElement/HTMLFrameElement, try contentDocument??contentWindow?.document??null,
ifnonnull recurse/fallback active, catch return active. Else return active. No new
cross-origin access, traversal or focus redirection. target=deepestActiveElement(document)
??document.body. Before validating clipboard data, if options.inputTargetToken !=null,
asElement(target) optional property fixed token must === live options.inputTargetToken
else throw Error('Active element is no longer the expected input target'). Do not
accept arbitrary/missing/token-stale target. Then if clipboardItems.length===0 throw
Error('Browser Use virtual clipboard has no data to paste'). No coercion/validation.

targetElement=asElement(target); view=targetElement null?window:elementWindow(target).
For requested MIME use clipboardItems.flatMap(item=>item.entries).find(entry=>
entry.mime_type===mime)?.text??''; preserve first entry value without extra string
coercion. plainText first text/plain; richText first text/html only when
options.richTextFallback===true, otherwise ''. No real clipboard API/permission.

fallbackPaste(target,html,text,replace): asElement else return. Get own-realm view.
If textarea OR input instanceof own-realm constructors: if disabled OR readOnly OR
text.length===0 return. setValue helper reads Object.getPrototypeOf(element),
prototype value descriptor setter and own value descriptor setter. If prototype
setter !=null AND ownSetter!==prototypeSetter call prototypeSetter bound element,
else assign element.value=value. No instanceof global constructors/React replacement.
If selectionStart==null OR selectionEnd==null: setValue(replace?text:element.value+text).
Otherwise reread selectionStart??element.value.length then selectionEnd??element.value.length,
try bound element.setRangeText(text,start,end,'end'); catch setValue with same replace
or append fallback. replace flag does not change normal setRangeText behavior.
Then bound element.dispatchEvent(new view.InputEvent('input',{bubbles:true})); return.
No new change event, fallback timer, unconditional value replace, focus on inputs.

Else if own-realm HTMLElement AND (isContentEditable OR closest('[contenteditable=true]')):
bound element.focus(); if html.length>0 bound ownerDocument.execCommand('insertHTML',false,html),
return even if execCommand false; else if text.length>0 execCommand('insertText',false,text).
No sanitization or selection recreation; ordinary noneditable target untouched.

If typeof view.DataTransfer!=='function' OR typeof view.ClipboardEvent!=='function':
invoke fallback with captured rich/plain text and LIVE options.replaceInputValue===true,
return {}. Otherwise new view.DataTransfer; iterate live clipboardItems and entries
in order; only typeof entry.text==='string' -> bound setData(entry.mime_type,entry.text).
Same MIME later writes overwrite transfer data but plain/rich fallback uses first
entry. Construct view.ClipboardEvent('paste',{bubbles:true,cancelable:true,
clipboardData:dataTransfer,composed:true}); dispatch on original raw target, bound
target.dispatchEvent. ONLY truthy dispatch result invokes fallback with live replace
flag (event can mutate option/selection); canceled event prevents fallback. Return {}.
Do not substitute targetElement for raw target or add null guard. All exceptions
retain existing propagation except stated iframe/setRangeText catches. No actual
DOM/window/browser/clipboard/permission invocation during authoring or validation.
