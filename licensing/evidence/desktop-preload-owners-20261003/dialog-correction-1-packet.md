# Complete preload dialog owner

Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No other source/tests/dependencies/history/config/environment/prior drafts/other author reads. No network, execution, formatter/build/tests or repository edits.
Author ONE COMPLETE TypeScript module at assigned /tmp path with ONE literal quoted heredoc or apply_patch. No file copying/transforms/assembly. SHA-only afterward; do not reopen/execute draft. Choose private design freely, no novelty requirement. Preserve complete behavior/API/context isolation/errors/references/order; imported policy unchanged. Do not export new APIs. Module-level side effects occur only when product loads module; curator validation injects all ports/globals. Never install actual preload/access user browser/clipboard/media/settings/permissions/data.
Packet exposes public imports/type declarations/function or bridge signatures and channel-routing contract data, no predecessor private helpers/state/decomposition or function bodies. Static facade names/signatures/channels/defaults/normalized identical expressions earn zero credit. Whole candidate accepted independence/MIT credit zero pending parent. Restrictions instruction-limited, not OS clean room.

Assigned output: /tmp/knorvia-preload-dialog-author.ts

## Permitted public imports/types

import { contextBridge, ipcRenderer } from "electron";
import { PlatformChannels } from "@knorvia/shared";
import { installEmbeddedBrowserWheelForwarding } from "./embeddedBrowserWheel.js";

interface DialogBridgeResult {
    handled: boolean;
    value?: boolean;
}

## Public bridge signatures and channel-routing catalog

{
  "bridges": [
    {
      "key": "BRIDGE_KEY",
      "methods": [
        {
          "name": "show",
          "signature": "(type: \"alert\" | \"confirm\", message: string) => DialogBridgeResult",
          "returnAnnotationPresent": true
        }
      ]
    }
  ],
  "routes": []
}

## External behavior


Module evaluation order:
1 If typeof window!=="undefined", installEmbeddedBrowserWheelForwarding(window,callback forwarding ipcRenderer.sendToHost(channel,payload)); returned disposer intentionally not retained/called.
2 contextBridge.exposeInMainWorld("__knorviaEmbeddedBrowserJavaScriptDialog__",object show).
3 contextBridge.executeInMainWorld({func:self-contained serialized function,args:[same bridge key]}). Function must rely only its arg and MAIN WORLD globals (window,String,WeakMap,WeakSet). Cannot close over module helpers/constants/types runtime. ContextBridge is retained isolation API; no direct shared window property injection.
show(type:"alert"|"confirm",message:string):DialogBridgeResult sync sendSync(PlatformChannels.EmbeddedBrowserJavaScriptDialog,{type,message}); admit nonnull object (arrays allowed) only handled===true; return{handled:true,...booleanvalueonly} else{handled:false}. Include false value; omitted nonboolean. Entire send/property observation inside try; any thrown error returns{handled:false}. Other fields dropped; no changed sender/channel/security policy.
Serialized main-world function first read window[bridgeKey], falsey=>return. Per execution tracks windows by installed confirm-function identity using WeakMap and frames via WeakSet. For each target window, within catch guard: if tracked confirm===target.confirm skip ALL installation (even if alert changed alone); else capture nativeAlert=target.alert.bind(target),nativeConfirm=target.confirm.bind(target). target.alert wrapper String(message) or"" only whenundefined; bridge.show("alert",text), if!handled invoke capturednativeAlert(text), alwaysvoid. target.confirm wrapper same stringcoercion, bridge.show("confirm",text), handled?value===true:nativeConfirm(text); settarget.confirm then trackthatwrapper. Thrown cross-source property/install errors swallowed. Bridge show wrapper main-world bridge thrown errors propagate out of alert/confirm wrapper; no newly added fallback catch.
Recursively install target then querySelectorAll("iframe") in target.document within catch. For each frame, if not observed markfirst, addEventListener("load",callback,true). Callback if frame.contentWindow truthy recursively install there. Immediately inspect frame.contentWindow truthy and install subtree too. Cross-origin tree errors swallowed. No disposer/removal/observer disconnect (document-lifetime registrations); do not invent cancellation. Install root tree once immediately; then observer setup callback re-installs tree, gets window.document?.documentElement, absent=>return, else new window.MutationObserver(()=>install root tree).observe(root,{childList:true,subtree:true}). If root initially present runsetupNOW;elsewindow.addEventListener?.("DOMContentLoaded",setup,{once:true}). Setup rewalks root tree before observer. Frames listeners deduplicate, replaced confirm re-wraps; same-origin about:blank descendants and later inserted frames receive wrappers.

## Body-free external correction

show() result.value is observed first for typeof boolean admission; if boolean observed AGAIN for returned value. A getter true on first read then throws on second must enter existing show catch and return {handled:false}. Do not cache this public property value. Serialized frame load callback reads frame.contentWindow outside catches; a thrown contentWindow getter in load callback propagates SAME raw error. During synchronous tree walks the enclosing tree catch swallows access errors and aborts the rest of THAT tree traversal, not catch each frame and continue. Preserve double truthy-test/access observations for frame.contentWindow (truthy test then value used). No new callback catches/teardown; all other original context isolation/lifetimes unchanged.
Initial whole draft frozen. Author ONE NEW WHOLE literal TypeScript file /tmp/knorvia-preload-dialog-correction-1.ts; no predecessor/draft/source/tests reads or transforms, only this packet/two instructions; SHA-only afterward. Choose private design freely.
