import test from 'node:test';
import assert from 'node:assert/strict';
import { owner, page, plain } from './commandChainOwnerTestPorts.mjs';

function realm() {
  const events = [];
  const document = { defaultView: null, activeElement: null, body: null, execCommand(command, ignored, value) { assert.equal(this, document); events.push([command, ignored, value]); return false; } };
  class Element {
    constructor() { this.ownerDocument = document; }
    dispatchEvent(event) { assert.equal(this.ownerDocument, document); events.push(event); return this.acceptPaste !== false; }
  }
  class HTMLElement extends Element {
    closest(selector) { assert.equal(selector, '[contenteditable=true]'); return null; }
    focus() { events.push('focus'); }
  }
  class Input extends HTMLElement {
    constructor() { super(); this.stored = 'abcd'; this.selectionStart = 1; this.selectionEnd = 3; }
    get value() { return this.stored; }
    set value(value) { this.stored = value; events.push(['prototype value', value]); }
    setRangeText(text, start, end, direction) { assert.equal(direction, 'end'); this.stored = this.stored.slice(0, start) + text + this.stored.slice(end); this.selectionStart = this.selectionEnd = start + text.length; events.push(['range', text, start, end]); }
  }
  class Textarea extends Input {}
  class Frame extends HTMLElement {}
  class Iframe extends Frame {}
  class InputEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } }
  class ClipboardEvent extends InputEvent {}
  class DataTransfer {
    constructor() { this.data = new Map(); this.onCreate?.(); }
    setData(mime, text) { this.data.set(mime, text); }
  }
  const window = { Element, HTMLElement, HTMLInputElement: Input, HTMLTextAreaElement: Textarea, HTMLFrameElement: Frame, HTMLIFrameElement: Iframe, InputEvent, ClipboardEvent, DataTransfer };
  document.defaultView = window; document.activeElement = new Input(); document.body = new HTMLElement();
  return { window, document, events, Input, HTMLElement, Iframe, DataTransfer };
}
const items = (...values) => values.map(text => ({ entries: [{ mime_type: 'text/plain', text }] }));

test('virtual paste own-realm focus, live data, selection and event authority', async () => {
  const api = owner('paste');
  assert.equal(api.IAB_INPUT_TARGET_TOKEN_PROPERTY, '__knorviaIabInputTargetToken');
  const r = realm();
  const paste = page(`(${api.VIRTUAL_PASTE_PAGE_FUNCTION})`, { document: r.document, window: r.window });
  const input = r.document.activeElement;
  input.setRangeText.call = () => { throw new Error('extra call property must not be used'); };
  input.dispatchEvent.call = () => { throw new Error('extra call property must not be used'); };
  r.DataTransfer.prototype.setData.call = () => { throw new Error('extra call property must not be used'); };
  await assert.rejects(paste({ inputTargetToken: 'wrong', clipboardItems: [] }), { message: 'Active element is no longer the expected input target' });
  assert.deepEqual(r.events, []);
  await assert.rejects(paste({ clipboardItems: [] }), { message: 'Browser Use virtual clipboard has no data to paste' });
  input[api.IAB_INPUT_TARGET_TOKEN_PROPERTY] = 'synthetic';
  assert.deepEqual(plain(await paste({ inputTargetToken: 'synthetic', clipboardItems: items('X', 'Y') })), {});
  assert.equal(input.value, 'aXd');
  const event = r.events[0];
  assert.equal(event.type, 'paste'); assert.equal(event.bubbles, true); assert.equal(event.cancelable, true); assert.equal(event.composed, true); assert.equal(event.clipboardData.data.get('text/plain'), 'Y');
  assert.deepEqual(r.events[1], ['range', 'X', 1, 3]);
  assert.equal(r.events[2].type, 'input'); assert.equal(r.events[2].bubbles, true);
  r.events.length = 0; input.acceptPaste = false;
  await paste({ clipboardItems: items('cancelled') });
  assert.equal(input.value, 'aXd'); assert.equal(r.events.length, 1); assert.equal(r.events[0].type, 'paste');
  input.acceptPaste = true;
  const options = { clipboardItems: items('captured') };
  r.window.DataTransfer = class extends r.DataTransfer { constructor() { super(); options.clipboardItems = items('live transfer'); } };
  r.events.length = 0;
  await paste(options);
  assert.equal(r.events[0].clipboardData.data.get('text/plain'), 'live transfer');
  assert.equal(input.value, 'acapturedd');
  r.window.DataTransfer = undefined; r.events.length = 0;
  input.selectionStart = input.selectionEnd = null;
  Object.defineProperty(input, 'value', { configurable: true, get() { return this.stored; }, set() { throw new Error('own setter bypass expected'); } });
  await paste({ clipboardItems: items('replacement'), replaceInputValue: true });
  assert.equal(input.stored, 'replacement'); assert.deepEqual(r.events[0], ['prototype value', 'replacement']); assert.equal(r.events[1].type, 'input');
  input.disabled = true; r.events.length = 0;
  await paste({ clipboardItems: items('disabled') }); assert.deepEqual(r.events, []);
  const editable = new r.HTMLElement(); editable.isContentEditable = true;
  r.document.activeElement = new r.HTMLElement(); r.document.activeElement.shadowRoot = { activeElement: editable };
  editable.focus.call = () => { throw new Error('extra call property'); };
  r.document.execCommand.call = () => { throw new Error('extra call property'); };
  r.events.length = 0;
  await paste({ clipboardItems: [{ entries: [{ mime_type: 'text/plain', text: 'plain' }, { mime_type: 'text/html', text: '<b>synthetic</b>' }] }], richTextFallback: true });
  assert.deepEqual(r.events, ['focus', ['insertHTML', false, '<b>synthetic</b>']]);
  const frame = new r.Iframe(); frame.contentDocument = { activeElement: editable }; r.document.activeElement = frame; r.events.length = 0;
  await paste({ clipboardItems: items('frame text') }); assert.deepEqual(r.events, ['focus', ['insertText', false, 'frame text']]);
  const failure = new Error('dispatch identity');
  r.document.activeElement = input; r.window.DataTransfer = r.DataTransfer;
  input.dispatchEvent = () => { throw failure; };
  await assert.rejects(paste({ clipboardItems: items('error') }), error => error === failure);
});
