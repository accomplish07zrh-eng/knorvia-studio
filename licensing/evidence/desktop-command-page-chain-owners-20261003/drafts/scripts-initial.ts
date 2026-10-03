const elementSemantics = `
function selectorFor(element) {
  var safeId = /^[A-Za-z][A-Za-z0-9_-]*$/;
  if (element.id && safeId.test(element.id)) return '#' + element.id;
  var parts = [];
  var node = element;
  var visited = 0;
  while (node && node.nodeType === 1 && visited < 6) {
    visited++;
    if (node.id && safeId.test(node.id)) {
      parts.unshift('#' + node.id);
      break;
    }
    var index = 1;
    var sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
    node = node.parentElement;
  }
  return parts.join(' > ');
}
function xpathFor(element) {
  var safeId = /^[A-Za-z][A-Za-z0-9_-]*$/;
  if (element.id && safeId.test(element.id)) return "//*[@id='" + element.id + "']";
  var parts = [];
  var node = element;
  while (node && node.nodeType === 1) {
    var index = 1;
    var sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
    node = node.parentElement;
  }
  return '/' + parts.join('/');
}
function accessibleName(element) {
  var name = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || element.getAttribute('placeholder');
  if (!name) name = element.innerText || element.textContent || '';
  return (name || '').trim().slice(0, 120);
}
function implicitRole(element) {
  var tag = element.tagName.toLowerCase();
  if (tag === 'a' && element.getAttribute('href') != null) return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    var type = (element.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
    if (type === 'search') return 'searchbox';
    return 'textbox';
  }
  return '';
}
function attributesFor(element) {
  var attrs = {};
  var keys = ['id', 'href', 'name', 'type', 'placeholder', 'title', 'alt', 'role', 'aria-label', 'data-testid', 'data-test', 'data-qa'];
  for (var i = 0; i < keys.length; i++) {
    var value = element.getAttribute(keys[i]);
    if (value != null && String(value).trim() !== '') {
      attrs[keys[i]] = String(value).trim().slice(0, 240);
    }
  }
  return attrs;
}
function appendActionDetails(record, element, withAttributes) {
  var tag = record.tag;
  var role = element.getAttribute('role') || implicitRole(element);
  if (role) record.role = role;
  var name = accessibleName(element);
  if (name) record.name = name;
  var text = (element.innerText || '').trim().slice(0, 100);
  if (text) record.text = text;
  if (withAttributes) {
    var attrs = attributesFor(element);
    if (Object.keys(attrs).length) record.attrs = attrs;
  }
  if ((tag === 'input' || tag === 'textarea' || tag === 'select') && element.value != null && element.value !== '') {
    record.value = String(element.value);
  }
  if (element.disabled === true) record.disabled = true;
  if (tag === 'input' && (element.type === 'checkbox' || element.type === 'radio')) {
    record.checked = element.checked === true;
  }
}
`;

export function SNAPSHOT_SCRIPT(maxElements?: number, includeHidden?: boolean): string {
  const maximum = typeof maxElements === 'number' && maxElements > 0 ? Math.floor(maxElements) : 200;
  const hidden = includeHidden === true;
  return `(function(){
${elementSemantics}
  var maximum = ${maximum};
  var includeHidden = ${hidden};
  try { window.__knorviaRefs = new Map(); }
  catch (error) { window.__knorviaRefs = null; }
  var elementRefs = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  function isHidden(element) {
    try {
      var style = getComputedStyle(element);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
      var rect = element.getBoundingClientRect();
      return rect.width <= 0 && rect.height <= 0;
    } catch (error) { return false; }
  }
  var actionNodes = document.querySelectorAll('a[href], button, input, textarea, select, [role], [onclick], [tabindex], summary, label, [contenteditable]');
  var elements = [];
  var count = 0;
  var truncated = false;
  for (var i = 0; i < actionNodes.length; i++) {
    var element = actionNodes[i];
    if (!includeHidden && isHidden(element)) continue;
    if (count >= maximum) {
      truncated = true;
      break;
    }
    count++;
    var ref = 'e' + count;
    if (window.__knorviaRefs) window.__knorviaRefs.set(ref, element);
    if (elementRefs) elementRefs.set(element, ref);
    var rect = element.getBoundingClientRect();
    var record = {
      ref: ref,
      tag: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      xpath: xpathFor(element),
      rect: {x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)},
      inViewport: rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0
    };
    if (elementRefs) {
      var ancestor = element.parentElement;
      while (ancestor) {
        var parentRef = elementRefs.get(ancestor);
        if (parentRef) {
          record.parentRef = parentRef;
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    appendActionDetails(record, element, true);
    elements.push(record);
  }
  var semanticNodes = document.querySelectorAll('body, main, nav, header, footer, aside, section, article, h1, h2, h3, h4, h5, h6, p, ul, ol, li, dl, dt, dd, blockquote, pre, code, table, caption, thead, tbody, tfoot, tr, th, td, form, fieldset, legend, figure, figcaption, img, canvas, svg, a[href], button, input, textarea, select, option, summary, label, [role], [aria-label], [contenteditable]');
  var dom = [];
  var domTruncated = false;
  for (var j = 0; j < semanticNodes.length; j++) {
    var semanticElement = semanticNodes[j];
    if (!includeHidden && isHidden(semanticElement)) continue;
    if (dom.length >= 300) {
      domTruncated = true;
      break;
    }
    var semanticRect = semanticElement.getBoundingClientRect();
    var tag = semanticElement.tagName.toLowerCase();
    var depth = 0;
    if (semanticElement !== document.body) {
      var parent = semanticElement.parentElement;
      while (parent && parent !== document.body) {
        depth++;
        parent = parent.parentElement;
      }
    }
    var semanticRecord = {
      tag: tag,
      depth: depth,
      inViewport: semanticRect.top < viewportHeight && semanticRect.bottom > 0 && semanticRect.left < viewportWidth && semanticRect.right > 0
    };
    if (elementRefs) {
      var semanticRef = elementRefs.get(semanticElement);
      if (semanticRef) semanticRecord.ref = semanticRef;
    }
    var semanticRole = semanticElement.getAttribute('role') || implicitRole(semanticElement);
    var semanticName = semanticElement.getAttribute('aria-label') || semanticElement.getAttribute('alt') || semanticElement.getAttribute('title') || semanticElement.getAttribute('placeholder');
    if (!semanticName && (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'summary')) {
      semanticName = accessibleName(semanticElement);
    }
    semanticName = String(semanticName || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
    var semanticText = '';
    if (/^(h[1-6]|p|li|dt|dd|blockquote|pre|code|caption|th|td|label|summary|button|a|option|legend|figcaption)$/.test(tag)) {
      semanticText = String(semanticElement.innerText || semanticElement.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300);
    }
    var semanticAttrs = attributesFor(semanticElement);
    if (semanticRole) semanticRecord.role = semanticRole;
    if (semanticName) semanticRecord.name = semanticName;
    if (semanticText) semanticRecord.text = semanticText;
    if (Object.keys(semanticAttrs).length) semanticRecord.attrs = semanticAttrs;
    dom.push(semanticRecord);
  }
  return {url: location.href, title: document.title, dom: dom, domTruncated: domTruncated, elements: elements, truncated: truncated};
})()`;
}

export function RESOLVE_SCRIPT(ref: string): string {
  return `(function(){
  var refs = window.__knorviaRefs;
  var element = refs && refs.get(${JSON.stringify(ref)});
  if (!element) return null;
  element.scrollIntoView({block: 'center', inline: 'center'});
  var rect = element.getBoundingClientRect();
  return {cx: Math.round(rect.left + rect.width / 2), cy: Math.round(rect.top + rect.height / 2)};
})()`;
}

export const VIEWPORT_SCRIPT = "(function(){return {scrollX:Math.round(window.scrollX||window.pageXOffset||0),scrollY:Math.round(window.scrollY||window.pageYOffset||0),innerWidth:window.innerWidth||document.documentElement.clientWidth||0,innerHeight:window.innerHeight||document.documentElement.clientHeight||0};})()";

export function SELECT_SCRIPT(ref: string, values: readonly string[]): string {
  return `(function(){
  var refs = window.__knorviaRefs;
  var element = refs && refs.get(${JSON.stringify(ref)});
  if (!element) return {error: 'ref_not_found'};
  if (!element.tagName || element.tagName.toLowerCase() !== 'select') return {error: 'not_select'};
  var requested = ${JSON.stringify(values)};
  var options = element.options;
  for (var i = 0; i < options.length; i++) options[i].selected = false;
  var matched = false;
  for (var j = 0; j < requested.length; j++) {
    var wanted = requested[j];
    var found = false;
    for (var k = 0; k < options.length; k++) {
      if (options[k].value === wanted) {
        options[k].selected = true;
        found = true;
        matched = true;
        break;
      }
    }
    if (!found) {
      for (var m = 0; m < options.length; m++) {
        if ((options[m].text || '').trim() === String(wanted).trim()) {
          options[m].selected = true;
          found = true;
          matched = true;
          break;
        }
      }
    }
  }
  if (!matched) return {error: 'no_match'};
  element.dispatchEvent(new Event('input', {bubbles: true}));
  element.dispatchEvent(new Event('change', {bubbles: true}));
  return {ok: true};
})()`;
}

export function CHECK_SCRIPT(ref: string, checked: boolean): string {
  return `(function(){
  var refs = window.__knorviaRefs;
  var element = refs && refs.get(${JSON.stringify(ref)});
  if (!element) return {error: 'ref_not_found'};
  var tag = element.tagName ? element.tagName.toLowerCase() : '';
  var type = ((element.getAttribute && element.getAttribute('type')) || '').toLowerCase();
  if (tag !== 'input' || (type !== 'checkbox' && type !== 'radio')) return {error: 'not_checkable'};
  var want = ${checked ? 'true' : 'false'};
  if (element.checked !== want) element.click();
  return {ok: true, checked: element.checked === true};
})()`;
}

export function ELEMENT_AT_POINT_SCRIPT(x: number, y: number): string {
  return `(function(){
${elementSemantics}
  var element = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
  if (!element || element.nodeType !== 1) return null;
  if (!window.__knorviaRefs) {
    try { window.__knorviaRefs = new Map(); }
    catch (error) { window.__knorviaRefs = null; }
  }
  window.__knorviaPtSeq = (window.__knorviaPtSeq || 0) + 1;
  var ref = 'p' + window.__knorviaPtSeq;
  if (window.__knorviaRefs) window.__knorviaRefs.set(ref, element);
  var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  var rect = element.getBoundingClientRect();
  var record = {
    ref: ref,
    tag: element.tagName.toLowerCase(),
    selector: selectorFor(element),
    xpath: xpathFor(element),
    rect: {x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)},
    inViewport: rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0
  };
  appendActionDetails(record, element, false);
  return record;
})()`;
}

export function EVALUATE_SCRIPT(expression: string): string {
  return `(function(){
  try {
    var value = (function(){return (${expression}\n);})();
    var serialized;
    try { serialized = JSON.stringify(value); }
    catch (error) { serialized = undefined; }
    if (typeof serialized === 'string') return {ok: true, kind: 'json', data: serialized};
    return {ok: true, kind: 'str', data: String(value)};
  } catch (error) {
    return {ok: false, message: (error && error.message) ? String(error.message) : String(error)};
  }
})()`;
}
