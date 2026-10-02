# Complete preload wheel owner

Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No other source/tests/dependencies/history/config/environment/prior drafts/other author reads. No network, execution, formatter/build/tests or repository edits.
Author ONE COMPLETE TypeScript module at assigned /tmp path with ONE literal quoted heredoc or apply_patch. No file copying/transforms/assembly. SHA-only afterward; do not reopen/execute draft. Choose private design freely, no novelty requirement. Preserve complete behavior/API/context isolation/errors/references/order; imported policy unchanged. Do not export new APIs. Module-level side effects occur only when product loads module; curator validation injects all ports/globals. Never install actual preload/access user browser/clipboard/media/settings/permissions/data.
Packet exposes public imports/type declarations/function or bridge signatures and channel-routing contract data, no predecessor private helpers/state/decomposition or function bodies. Static facade names/signatures/channels/defaults/normalized identical expressions earn zero credit. Whole candidate accepted independence/MIT credit zero pending parent. Restrictions instruction-limited, not OS clean room.

Assigned output: /tmp/knorvia-preload-wheel-author.ts

## Permitted public imports/types

import { EmbeddedBrowserWebviewChannels, type EmbeddedBrowserWheelBoundaryPayload, } from "@knorvia/shared";

type SendToHost = (channel: string, payload: EmbeddedBrowserWheelBoundaryPayload) => void;
export function installEmbeddedBrowserWheelForwarding(targetWindow: Window, sendToHost: SendToHost): () => void;

## Public bridge signatures and channel-routing catalog

{
  "bridges": [],
  "routes": []
}

## External behavior


installEmbeddedBrowserWheelForwarding(targetWindow:Window,sendToHost:(channel:string,payload:EmbeddedBrowserWheelBoundaryPayload)=>void):()=>void registers one "wheel" listener options {passive:true}; disposer removeEventListener("wheel",same handler) with no options. Multiple installs independent; repeated disposer calls call removal again; queued sends are NOT cancelled by disposal. No preventDefault/stopPropagation.
Normalize axes CSS pixels: epsilon=.01 raw nonfinite ORabs<=.01=>0 BEFORE scaling. deltaMode===1 scale40;===2 scaleMath.max(1,pageSize);otherwise1; clamp +/-10000. Xraw event.deltaX ifabsX>.01 else shiftKey?event.deltaY:0; Yraw shiftKey?0:event.deltaY. PageSizes window.innerWidth/innerHeight respectively, no integer rounding.
A normalized axis==0 cannot be consumed. Otherwise collect element candidates from event.composedPath in encounter order/dedup Set using "nodeType" in target &&target.nodeType===1 (no instanceof); append document.scrollingElement iftruthy. Some candidate can consume when scrollWidth-clientWidth / scrollHeight-clientHeight >1, style axis overflow or fallback overflow; hidden/clip disallow; non-document-scroller overflow must auto/scroll/overlay, document scroller permits other overflow. Vertical delta>0 scrollTop<max-1 else scrollTop>1. Horizontal normal delta>0 scrollLeft<max-1 else scrollLeft>1. RTL delta>0 scrollLeft< -1 else scrollLeft> -max+1.
Evaluate X consumption then Y, separately reading path/style. Hostpayload sets consumedaxis0, othersnormalized. Both0=>noqueue. Otherwise queueMicrotask once; at microtask observe event.defaultPrevented, iftrue drop, else sendToHost(EmbeddedBrowserWebviewChannels.WheelBoundary,{deltaX,deltaY}) with values captured at listener time. Raw path/style/queue/send errors propagate, no added catches/validation policies.
