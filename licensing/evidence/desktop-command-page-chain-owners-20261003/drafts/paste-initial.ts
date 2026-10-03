export const IAB_INPUT_TARGET_TOKEN_PROPERTY = '__knorviaIabInputTargetToken';

export const VIRTUAL_PASTE_PAGE_FUNCTION = `async (options) => {
  const asElement = (target) => {
    if (target == null || typeof target !== 'object' || !('ownerDocument' in target)) {
      return null;
    }
    const view = target.ownerDocument?.defaultView ?? null;
    if (view == null || !(target instanceof view.Element)) {
      return null;
    }
    return target;
  };

  const elementWindow = (element) => element.ownerDocument.defaultView ?? window;

  const deepestActiveElement = (root) => {
    const active = root.activeElement;
    if (active == null) {
      return null;
    }
    const view = elementWindow(active);
    if (active instanceof view.HTMLElement && active.shadowRoot != null) {
      return deepestActiveElement(active.shadowRoot) ?? active;
    }
    if (active instanceof view.HTMLIFrameElement || active instanceof view.HTMLFrameElement) {
      try {
        const childDocument = active.contentDocument ?? active.contentWindow?.document ?? null;
        if (childDocument != null) {
          return deepestActiveElement(childDocument) ?? active;
        }
      } catch {
        return active;
      }
    }
    return active;
  };

  const fallbackPaste = (target, html, text, replace) => {
    const element = asElement(target);
    if (element == null) {
      return;
    }
    const view = elementWindow(element);
    if (element instanceof view.HTMLTextAreaElement || element instanceof view.HTMLInputElement) {
      if (element.disabled || element.readOnly || text.length === 0) {
        return;
      }
      const setValue = (value) => {
        const prototype = Object.getPrototypeOf(element);
        const prototypeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        const ownSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        if (prototypeSetter != null && ownSetter !== prototypeSetter) {
          prototypeSetter.call(element, value);
        } else {
          element.value = value;
        }
      };
      if (element.selectionStart == null || element.selectionEnd == null) {
        setValue(replace ? text : element.value + text);
      } else {
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? element.value.length;
        try {
          element.setRangeText.call(element, text, start, end, 'end');
        } catch {
          setValue(replace ? text : element.value + text);
        }
      }
      element.dispatchEvent.call(element, new view.InputEvent('input', { bubbles: true }));
      return;
    }
    if (element instanceof view.HTMLElement &&
        (element.isContentEditable || element.closest('[contenteditable=true]'))) {
      element.focus.call(element);
      const ownerDocument = element.ownerDocument;
      if (html.length > 0) {
        ownerDocument.execCommand.call(ownerDocument, 'insertHTML', false, html);
        return;
      }
      if (text.length > 0) {
        ownerDocument.execCommand.call(ownerDocument, 'insertText', false, text);
      }
    }
  };

  const target = deepestActiveElement(document) ?? document.body;
  if (options.inputTargetToken != null &&
      asElement(target)?.['__knorviaIabInputTargetToken'] !== options.inputTargetToken) {
    throw new Error('Active element is no longer the expected input target');
  }
  const clipboardItems = options.clipboardItems;
  if (clipboardItems.length === 0) {
    throw new Error('Browser Use virtual clipboard has no data to paste');
  }
  const targetElement = asElement(target);
  const view = targetElement == null ? window : elementWindow(targetElement);
  const firstText = (mime) => clipboardItems.flatMap((item) => item.entries)
    .find((entry) => entry.mime_type === mime)?.text ?? '';
  const plainText = firstText('text/plain');
  const richText = options.richTextFallback === true ? firstText('text/html') : '';

  if (typeof view.DataTransfer !== 'function' || typeof view.ClipboardEvent !== 'function') {
    fallbackPaste(target, richText, plainText, options.replaceInputValue === true);
    return {};
  }
  const dataTransfer = new view.DataTransfer();
  for (const item of clipboardItems) {
    for (const entry of item.entries) {
      if (typeof entry.text === 'string') {
        dataTransfer.setData.call(dataTransfer, entry.mime_type, entry.text);
      }
    }
  }
  const event = new view.ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
    composed: true,
  });
  if (target.dispatchEvent.call(target, event)) {
    fallbackPaste(target, richText, plainText, options.replaceInputValue === true);
  }
  return {};
}`;
