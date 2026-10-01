# B5 UI component contracts

2026-10-01. Lane B starts at exact integrated commit
`0d80f9ca37b1daef162ecc69bd18f6e8fc30a146` on
`parallel/ui-components-fast-20261001`. B1–B4 are already integrated and are outside
this scope. Owned production entrypoints are only `scroll-fade-viewport.tsx`,
`flip-metric-value.tsx`, and `toast.tsx`, with narrowly named private helpers when
needed. Freeze tests on the old source before replacing each entrypoint.

## Source and authority

The author has read the legacy source and its current consumers. This is a
source-exposed, specification-led implementation attempt, not a clean-room or
MIT determination. The current inventory calls scroll fade and flip metric
upstream-unchanged, and toast upstream-modified; none has an accepted review.
Retain LICENSE, NOTICE, preview identity, third-party obligations and all 27
unresolved material obligations. Only root may update shared provenance and
integration refs. No user data, persistence, credentials, network application
calls, release, deployment or security configuration changes are involved.

## One owner and order

```text
Bash consumer owns following/frozen output and scroll position
  → one viewport DOM node → read geometry → local fade projection
  → passive scroll / resize notification → local fade projection

metric value prop → Unicode character slots → media preference subscription
  → static or Motion presentation; no numerical interpolation or timers

toast command → module-local notification owner → React projection
  → mount admission (pending update/dismiss) → ordered stack
  → entry frame → duration expiry → exit delay → removal
```

All three belong to existing unmanaged architecture module `ui`. No service,
store, protocol or platform ownership moves. Desktop continuous and mobile
replay use the same presentation inputs; no accepted task state lives here.

## Scroll fade contract (smallest first)

- One outer div is both consumer ref and scroll event target. It contains exactly
  one content div. Forward all div attributes/events and children; caller props
  retain the old override order. `className` merges after internal classes.
- Base classes are `min-h-0 flex-1 overflow-y-auto`; `data-scroll-mask` starts
  `none`. Preserve four class strings with standard and WebKit 24px gradients.
- Read `max = scrollHeight - clientHeight`. For max <= 1 no fade; otherwise top
  is hidden exactly when scrollTop > 1, bottom when scrollTop < max - 1.
  Keep fractional, negative and overscroll comparisons; do not clamp or write
  scrollTop. Native geometry is the only source of this projection.
- Read once after mount and children changes. Scroll updates synchronously via
  a passive listener. ResizeObserver watches viewport and content; window resize
  is always watched. Resize notifications coalesce into one animation frame.
  The same window resize path works without ResizeObserver.
- Remove listeners, disconnect observer and cancel queued frame on cleanup.
  Reattach when children change. Ref object/callback consumers see the same outer
  node; unmount clears the ref. Preserve ExecuteOutput's five-line window,
  keyboard tabIndex and existing pause/resume/following owner.

## Flip metric contract

- `value: string`, optional className and animateInitial (default false). Outer
  span has role text, aria-label and title equal to value; data-animate-initial
  exists only when true. Exact wrapper geometry/classes and Unicode code-point
  splitting remain. Slots are stable by position, not by whole value.
- ASCII digits only animate. Width is .66em for ASCII digits, .34em for colon or
  period, .7em otherwise; all slots are 1.15em high and aria-hidden true. Static
  slots center the character; digit slots clip and use perspective 8em.
- Motion owns digit entrance/exit, with duration .16 seconds, easing
  [.4,0,.2,1], rotateX -90→0→90, y -.45em→0→.45em, opacity 0→1→0,
  transformOrigin 50% 50%. Preserve animateInitial and positional digit key.
- Reduced motion initially false, then follows matchMedia reduce. Support both
  modern change listeners and legacy addListener/removeListener. Without
  window/matchMedia stay at false. Remove the matching listener on unmount.
  Preference changes use static slots, with no digit animations. No new fonts,
  themes, glyphs, focus targets, input state or value interpolation.

## Toast contract

- Preserve exports, signatures, numeric IDs from zero, all positions/variants,
  default top-center/default/3000ms and optional duration zero/nonfinite sticky
  behavior. Unknown IDs update/dismiss with no visible effect. Public dismiss
  removes immediately; actions and visible close animate out for 200ms.
- Preserve mount admission: calls before effect registration keep their IDs;
  patches merge in order, pre-mount dismissal suppresses admission. Dedupe only
  on truthy exact key: remove matching entries globally and append latest at the
  tail. Update merges in place without dedupe/reorder; patch can change position,
  duration, message and callbacks. No storage or application data access.
- Four fixed stack divs exist in top-center, top-right, bottom-left, bottom-center
  order, even when empty. Top-center truthy anchorId entries group by first-seen
  anchor order. Other positions ignore anchorId. Top 64px; sides 16px; bottom
  safe-area inset plus 16px; gap 8px; z-index 9999. Anchor uses rect.left+width/2,
  falls back to default centered layout when absent, and follows resize,
  body subtree mutation and capturing passive document scroll; observers clean up.
- Freeze ToastMessageView DOM/class output for default/update/info/warning,
  visible/hidden/top-right/bottom states, multiline title/body overrides,
  optional action and dismiss controls. Preserve black-white theme tokens,
  radius, blur, shadows, widths, wrapping, inherited typography and button
  semantics. Native buttons retain keyboard activation/focus; icon aria-hidden
  and dismissLabel/Close are preserved. Do not add roles/live announcements.
- Entry happens on animation frame. Finite positive duration starts on mount;
  duration changes reset that timer and trigger entry again; unrelated patches
  do not restart it. Expiry hides then schedules removal 200ms later. Callback
  order remains action then dismissal; thrown action does not dismiss.
- Existing cleanup limitations (uncancelled entry/exit work) and repeated
  pre-effect host creation are recorded baseline behavior, not newly approved
  fixes. Do not silently change them in the initial smallest replacement.

## Acceptance and gaps

Commit spec and frozen old-source contracts first. Execute source and actual UI
TypeScript dist contracts, real consumer modules and a Web production build.
Run root typecheck/lint, owned formatting, diff and changed/full architecture.
Use existing Node test runner; DOM supplemental tests may use a scratch jsdom
installation, without adding common dependencies. State exactly which tests use
simulated geometry/frames and which use native browsers. Retain baseline failures
and existing timeout budgets. Source maps must tie emitted consumers to actual
candidate bytes, not substitute mock entrypoints.

Browser scenarios: both themes at desktop and 390px mobile widths; scroll top,
interior, bottom and resize/content growth; consumer ref and keyboard focus;
metric punctuation/Unicode, value updates and modern/legacy reduced motion;
all toast positions, anchor replacement, sticky→timed completion, pre-mount
update/dismiss, dedupe, action/close with Tab/Enter and narrow long labels.
Screenshots, computed masks, native animations and mobile layout are required
for full visual/native acceptance. The current Chromium launch fails with a
misconfigured SUID sandbox helper; no sandbox bypass is allowed. Electron
binary download fails ECONNREFUSED. DOM/SSR/build evidence cannot replace those
native gates. Report before expanding beyond the smallest component.
